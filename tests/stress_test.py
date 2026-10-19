#!/usr/bin/env python3
"""ASILUM brain stress test.

1000 bot users, 10 taste archetypes, 7000+ interactions simulating real
behavior, then an evaluation phase measuring CROSS-ACCOUNT learning:
  1. personalization: does each bot's feed converge to its persona?
  2. taste graph: do co-engagement edges connect same-archetype items?
  3. popularity transfer: does a fresh user inherit the crowd's signal?
  4. board taste transfer: does a shared board steer a stranger's feed?
  5. archetype separation: do different personas get different feeds?
  6. zones: core (already like) vs discovery (probably like) vs far reach

RUNNING IT (r22 — read this before trusting a run):

    # production build, then a server the harness can actually saturate
    GLOBAL_BUDGET_IDENTITY_ISSUE=20000 GLOBAL_BUDGET_FEED=60000 \
    GLOBAL_BUDGET_SEARCH=20000 GLOBAL_BUDGET_DISCOVER=20000 \
    GLOBAL_BUDGET_INTERPRET=20000 \
    TRUSTED_EDGE_IP_HEADER=x-asilum-bot-ip \
    RATE_LIMIT_SUBJECT_SALT=<32+ chars> \
    npx next start -p 3457
    python3 tests/stress_test.py

Without those two blocks the gate measures the RATE LIMITER, not the brain,
and says so only in its error count:

  · The anonymous-abuse boundary (release blocker 0A-4) caps identity issuance
    at 300/minute GLOBALLY. A thousand bots mint in seconds, so ~700 of them
    never get an identity. The budgets are documented as tunable per scope for
    exactly this reason; a bench raises them, a deployment does not.
  · Every bot arrives from 127.0.0.1 unless it carries its own edge IP, so the
    per-subject quota sees one caller. See EDGE_IP_HEADER below.

Measured at head on 8/6 with neither set: 4430 API calls, 2042 errors, 0.47 of
3 rounds per bot — a fifth of a run, printing full-looking numbers. Check the
error count and rounds/bot in the SIMULATION header before reading anything
below it.
"""
import json, math, os, random, re, time, statistics, threading
import http.cookiejar
import urllib.request
from concurrent.futures import ThreadPoolExecutor

# The harness ritual runs a production server on :3457; ASILUM_STRESS_BASE
# points it at another port when one is already up.
BASE = os.environ.get("ASILUM_STRESS_BASE", "http://localhost:3457")
random.seed(42)

# ---- bot world (r22, audit #10) ---------------------------------------------
# The offline harness (lib/brain/replay.js) and this live gate must model the
# SAME reader, or the two instruments disagree about what a good feed is. The
# constants below mirror REALISM there exactly; see that file for the
# declaration and the calibration record.
#
#   flat       — the pre-r22 bot: position-flat inside the examined window,
#                never leaves, never tires, cannot see a price. DEFAULT, so
#                historical runs of this gate stay comparable.
#   satiating  — all four knobs on. The declared sensitivity arm.
#
#   ASILUM_BOT_WORLD=satiating python3 tests/stress_test.py
#
# Each bot also gets its OWN seeded RNG. The old code drew from the global
# `random` inside a 24-thread pool, so `random.seed(42)` bought nothing —
# interleaving decided the draws and no run reproduced another.
WORLD = os.environ.get("ASILUM_BOT_WORLD", "flat")
KNOBS = {"attention": WORLD == "satiating", "dropout": WORLD == "satiating",
         "satiation": WORLD == "satiating", "price": WORLD == "satiating"}
REALISM = {
    "ATTENTION_TAU": 12, "ATTENTION_FLOOR": 0.25,
    "DROPOUT_BASE": 0.04, "DROPOUT_PER_SKIP": 0.06,
    "DROPOUT_PER_POSITIVE": 0.03, "DROPOUT_MAX": 0.6,
    "SAT_RATE": 0.06, "SAT_DECAY": 0.4,
    "PRICE_FLOOR": 0.35, "BUDGET_LO": 250, "BUDGET_HI": 1600,
}

def attention_at(slot):
    if not KNOBS["attention"]:
        return 1.0
    f, tau = REALISM["ATTENTION_FLOOR"], REALISM["ATTENTION_TAU"]
    return f + (1 - f) * math.exp(-slot / tau)

def price_factor(budget, item):
    if not KNOBS["price"]:
        return 1.0
    price = item.get("price") or 0
    try:
        price = float(price)
    except (TypeError, ValueError):
        return 1.0
    if not price or price <= budget:
        return 1.0
    return max(REALISM["PRICE_FLOOR"], budget / price)

def satiation_factor(sat, tag):
    if not KNOBS["satiation"] or not tag:
        return 1.0
    return 1.0 / (1.0 + REALISM["SAT_RATE"] * sat.get(tag, 0.0))

def dominant_tag(item):
    tags = item.get("tags") or {}
    if not tags:
        return None
    # ties break on tag name, matching lib/brain/replay.js dominantTag
    return sorted(tags.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]

# Identity hardening (July audit) means the server ignores claimed user=
# params: anonymous identity lives in the signed HttpOnly device cookie
# from GET /api/auth. Every logical bot therefore carries its own cookie
# jar, exactly like a real device. The user= params below are kept only
# as session keys for the jar routing; the server never trusts them.
SESS = {}
SESS_LOCK = threading.Lock()

# (r22) ONE THOUSAND READERS ARE NOT ONE IP.
# Every bot used to arrive from 127.0.0.1, so the anonymous-minting boundary
# (lib/security/request.js) saw a single subject and 429'd identity issuance
# after the first few dozen. At head that costs ~2000 failed calls and about
# half a round per bot — the documented 1000-bot gate could not complete, on
# main or on this branch, and the numbers it printed were a fifth of a run.
# Each bot now carries its own synthetic edge IP, which is what a real
# thousand-device population looks like to the limiter.
#
# THIS IS TEST-BENCH CONFIGURATION, NOT A PRODUCTION PATTERN. It works only
# because the local harness server is started with TRUSTED_EDGE_IP_HEADER
# naming this header. request.js is explicit that a request-supplied IP header
# is attacker-controlled anywhere the platform does not set it, and trusting a
# client-settable header in production would hand one caller unlimited
# identities. Do not set this header name on a deployed environment.
EDGE_IP_HEADER = os.environ.get("ASILUM_STRESS_IP_HEADER", "x-asilum-bot-ip")

def bot_ip(uid):
    h = 0
    for ch in uid:
        h = (h * 131 + ord(ch)) & 0xFFFFFF
    return "10.%d.%d.%d" % ((h >> 16) & 0xFF, (h >> 8) & 0xFF, (h & 0xFF) or 1)

def opener_for(uid):
    with SESS_LOCK:
        op = SESS.get(uid)
        if op is None:
            jar = http.cookiejar.CookieJar()
            op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
            op._asilum_jar = jar
            op._asilum_booted = False
            SESS[uid] = op
    if not op._asilum_booted:
        try:
            boot = urllib.request.Request(BASE + "/api/auth", headers={EDGE_IP_HEADER: bot_ip(uid)})
            with op.open(boot, timeout=30) as r:
                json.load(r)
            # production builds mark the cookie Secure; we test over
            # plain http on localhost, so clear the flag client-side
            for c in op._asilum_jar:
                c.secure = False
        except Exception as e:
            ERRORS.append(f"AUTH {uid}: {e}")
        op._asilum_booted = True
    return op

def uid_of(path, payload):
    m = re.search(r"[?&]user=([^&]+)", path)
    if m:
        return m.group(1)
    if isinstance(payload, dict) and payload.get("user"):
        return str(payload["user"])
    return "__anon__"

LAT = []
LAT_LOCK = threading.Lock()
ERRORS = []
CALLS = [0]

def call(method, path, payload=None):
    t0 = time.time()
    try:
        uid = uid_of(path, payload)
        op = opener_for(uid)
        headers = {EDGE_IP_HEADER: bot_ip(uid)}
        if payload is None:
            req = urllib.request.Request(BASE + path, headers=headers)
        else:
            headers["Content-Type"] = "application/json"
            req = urllib.request.Request(BASE + path, json.dumps(payload).encode(),
                                         headers, method=method)
        with op.open(req, timeout=30) as r:
            out = json.load(r)
    except Exception as e:
        ERRORS.append(f"{method} {path}: {e}")
        return None
    finally:
        with LAT_LOCK:
            LAT.append((time.time() - t0) * 1000)
            CALLS[0] += 1
    return out

ARCHETYPES = {
    "avant":     {"AVANT-GARDE": 1.0, "ARCHIVAL": 0.7},
    "gorp":      {"GORP": 1.0, "UTILITARIAN": 0.7},
    "quietlux":  {"MINIMAL": 1.0, "TAILORED": 0.7},
    "street":    {"STREETWEAR": 1.0, "STATEMENT": 0.7},
    "seductive": {"SEDUCTIVE": 1.0, "STATEMENT": 0.7},
    "indie":     {"INDEPENDENT": 1.0, "ARCHIVAL": 0.7},
    "workwear":  {"UTILITARIAN": 1.0, "STREETWEAR": 0.7},
    "eveningtl": {"TAILORED": 1.0, "SEDUCTIVE": 0.7},
    "minavant":  {"MINIMAL": 1.0, "AVANT-GARDE": 0.7},
    "archivalt": {"ARCHIVAL": 1.0, "TAILORED": 0.7},
}
PROMPTS = {
    "avant": "rick owens deconstructed archival", "gorp": "arcteryx alps gorpcore",
    "quietlux": "quiet luxury the row beige", "street": "supreme drill streetwear",
    "seductive": "tom ford leather mob wife", "indie": "kapital grunge distressed",
    "workwear": "carhartt workwear olive", "eveningtl": "saint laurent milan jazz",
    "minavant": "jil sander berlin ambient", "archivalt": "helmut lang 1990s archival",
}

def cos(a, b):
    dot = sum(a.get(k, 0) * b.get(k, 0) for k in set(a) | set(b))
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    return dot / (na * nb) if na and nb else 0.0

# Mirror of the brain's TAG_AFFINITY: bots have HUMAN-like latent taste — they
# also enjoy aesthetics adjacent to their declared persona (that's what the
# discovery zone is for). Judged taste = persona expanded one hop.
ALL_TAGS = ["AVANT-GARDE", "SEDUCTIVE", "STATEMENT", "TAILORED", "ARCHIVAL",
            "MINIMAL", "UTILITARIAN", "STREETWEAR", "GORP", "INDEPENDENT"]
AFF = {("AVANT-GARDE","STATEMENT"):0.7, ("AVANT-GARDE","ARCHIVAL"):0.6,
       ("AVANT-GARDE","INDEPENDENT"):0.5, ("AVANT-GARDE","SEDUCTIVE"):0.3,
       ("SEDUCTIVE","STATEMENT"):0.6, ("SEDUCTIVE","TAILORED"):0.5,
       ("STATEMENT","STREETWEAR"):0.5, ("STATEMENT","ARCHIVAL"):0.4,
       ("TAILORED","MINIMAL"):0.7, ("TAILORED","ARCHIVAL"):0.4,
       ("ARCHIVAL","MINIMAL"):0.5, ("ARCHIVAL","INDEPENDENT"):0.5,
       ("MINIMAL","UTILITARIAN"):0.4, ("UTILITARIAN","GORP"):0.7,
       ("UTILITARIAN","STREETWEAR"):0.6, ("STREETWEAR","GORP"):0.5,
       ("STREETWEAR","INDEPENDENT"):0.4}
def tag_sim(a, b):
    if a == b: return 1.0
    return AFF.get((a, b)) or AFF.get((b, a)) or 0.0
def latent_taste(persona):
    j = dict(persona)
    for t, v in persona.items():
        for c in ALL_TAGS:
            if c != t and tag_sim(t, c):
                j[c] = max(j.get(c, 0), v * tag_sim(t, c) * 0.8)
    return j

def alignment(items, persona, k=20):
    sims = [cos(it.get("tags") or {}, persona) for it in items[:k]]
    return statistics.mean(sims) if sims else 0.0

# ---- Phase 0: cold baseline (before any learning) --------------------------
baseline = {}
cold = call("GET", "/api/feed?user=__baseline__")
for name, persona in ARCHETYPES.items():
    baseline[name] = alignment(cold["items"], persona)

# ---- Phase 1: 500 bots live their lives -------------------------------------
BOTS = []
for i in range(1000):
    arch = list(ARCHETYPES)[i % 10]
    brnd = random.Random(0xA51 ^ i)
    BOTS.append({"id": f"bot-{arch}-{i}", "arch": arch, "persona": ARCHETYPES[arch],
                 "judge": latent_taste(ARCHETYPES[arch]),
                 "seed": 0xA51 ^ i,
                 "budget": REALISM["BUDGET_LO"] + brnd.random() * (REALISM["BUDGET_HI"] - REALISM["BUDGET_LO"]),
                 "trains": (i // 10) % 2 == 0})  # half of EACH archetype trains with a prompt, half learns purely from behavior

stats = {"favorite": 0, "save": 0, "share": 0, "skip": 0, "dwell": 0}
zone_stats = {}  # zone -> [considered, engaged]
# r22: what the realism knobs cost, reported so a run says how much of the
# feed the crowd actually saw rather than how much was served.
world_stats = {"rounds": 0, "dropped": 0, "examined": 0, "offered": 0}
stats_lock = threading.Lock()

def note_zone(zone, engaged):
    with stats_lock:
        z = zone_stats.setdefault(zone or "core", [0, 0])
        z[0] += 1
        if engaged:
            z[1] += 1

def run_bot(bot):
    uid, persona = bot["id"], bot["persona"]
    rnd = random.Random(bot["seed"])
    sat = {}          # dominant tag -> accumulated satiation
    if bot["trains"]:
        call("POST", "/api/train", {"user": uid, "prompt": PROMPTS[bot["arch"]]})
    interactions = 0
    rounds_done, dropped = 0, False
    for round_ in range(3):
        feed = call("GET", f"/api/feed?user={uid}")
        if not feed or not feed.get("items"):
            break
        rounds_done += 1
        dwell_batch = []
        page_skips, page_positives = 0, 0
        # (r19) A bot examines the first 16 of 60 slots — the same shape a
        # real reader has, and the reason serve-counted impressions were
        # position-biased. Report exactly what was examined, and carry the
        # slot's bridge back the way the browser client does (the harness used
        # to strip _bridge, which is why it never caught the attribution
        # break the Aug 5 audit found by reading code).
        # (r22) Within that window attention now DECAYS: the eye does not land
        # on slot 15 as reliably as on slot 0. A slot that was never examined
        # is not reported as an impression, which is the whole point of the
        # examined-ids channel.
        window = list(enumerate(feed["items"][:16]))
        looked = [(slot, it) for slot, it in window if rnd.random() < attention_at(slot)]
        examined_ids = [it["id"] for _, it in looked]
        with stats_lock:
            world_stats["offered"] += len(window)
            world_stats["examined"] += len(looked)
        if feed.get("serveId") and examined_ids:
            call("POST", "/api/impressions",
                 {"user": uid, "serveId": feed["serveId"], "examined": examined_ids})
        for slot, it in looked:
            if interactions >= 7:
                break
            # Effective taste: latent affinity, discounted by what the bot can
            # afford and by how much of this aesthetic it has just consumed.
            # Both factors are 1.0 in the flat world, so judgment is unchanged.
            dom = dominant_tag(it)
            sim = (cos(it.get("tags") or {}, bot["judge"])
                   * price_factor(bot["budget"], it)
                   * satiation_factor(sat, dom))
            slim = {"id": it["id"], "tags": it.get("tags") or {}, "_bridge": it.get("_bridge")}
            r = rnd.random()
            engaged = sim > 0.55 and r < 0.55
            note_zone(it.get("_zone"), engaged)
            if engaged:
                act = "favorite" if r < 0.35 else ("save" if r < 0.50 else "share")
                if act == "save":
                    call("POST", "/api/boards", {"user": uid, "item": it})
                else:
                    call("POST", "/api/interaction",
                         {"user": uid, "item": slim, "action": act,
                          "dwellMs": rnd.randint(4000, 9000)})
                with stats_lock: stats[act] += 1
                interactions += 1
                page_positives += 1
                if dom:
                    sat[dom] = sat.get(dom, 0.0) + 1.0
            elif sim < 0.22 and r < 0.6:
                call("POST", "/api/interaction",
                     {"user": uid, "item": slim, "action": "skip",
                      "dwellMs": rnd.randint(200, 900)})
                with stats_lock: stats["skip"] += 1
                interactions += 1
                page_skips += 1
            elif 0.35 < sim <= 0.55 and r < 0.25:
                dwell_batch.append({"item": slim, "action": "dwell",
                                    "dwellMs": rnd.randint(2500, 7000)})
        if dwell_batch:
            call("POST", "/api/interaction", {"user": uid, "events": dwell_batch})
            with stats_lock: stats["dwell"] += len(dwell_batch)
            interactions += len(dwell_batch)
        if KNOBS["satiation"]:
            for k in list(sat):
                sat[k] *= REALISM["SAT_DECAY"]
        if KNOBS["dropout"]:
            hazard = min(REALISM["DROPOUT_MAX"],
                         max(0.0, REALISM["DROPOUT_BASE"]
                             + REALISM["DROPOUT_PER_SKIP"] * page_skips
                             - REALISM["DROPOUT_PER_POSITIVE"] * page_positives))
            if rnd.random() < hazard:
                dropped = True
                break
        if interactions >= 7:
            break
    with stats_lock:
        world_stats["rounds"] += rounds_done
        world_stats["dropped"] += 1 if dropped else 0

t0 = time.time()
with ThreadPoolExecutor(max_workers=24) as ex:
    list(ex.map(run_bot, BOTS))
sim_secs = time.time() - t0

# ---- Phase 2: evaluation ------------------------------------------------------
print("=" * 64)
print(f"SIMULATION  {CALLS[0]} API calls | {len(BOTS)} bots | {sim_secs:.0f}s | errors: {len(ERRORS)}")
print(f"  bot world: {WORLD}  knobs: {', '.join(k for k, v in KNOBS.items() if v) or 'none'}")
print(f"  attention: examined {world_stats['examined']}/{world_stats['offered']} offered slots"
      f" ({100*world_stats['examined']/max(1,world_stats['offered']):.0f}%)"
      f" | rounds/bot {world_stats['rounds']/max(1,len(BOTS)):.2f} of 3"
      f" | left early: {world_stats['dropped']}/{len(BOTS)}")
print(f"  actions: {stats}")
lat = sorted(LAT)
print(f"  latency ms  p50={lat[len(lat)//2]:.0f}  p95={lat[int(len(lat)*0.95)]:.0f}  max={lat[-1]:.0f}")

# 2a. personalization convergence
print("-" * 64)
print("1) PERSONALIZATION (feed alignment to persona, cold -> trained)")
gains, per_arch = [], {}
by_arch = {}
for b in BOTS:
    by_arch.setdefault(b["arch"], []).append(b)
sample = [b for arch in ARCHETYPES for b in by_arch[arch][:20]]  # 20 bots x 10 archetypes
for bot in sample:
    feed = call("GET", f"/api/feed?user={bot['id']}")
    a = alignment(feed["items"], bot["persona"])
    gains.append(a - baseline[bot["arch"]])
    per_arch.setdefault(bot["arch"], []).append(a)
print(f"   mean alignment gain over cold feed: {statistics.mean(gains):+.3f} "
      f"({sum(1 for g in gains if g > 0)}/{len(gains)} bots improved)")
for arch in ARCHETYPES:
    print(f"   {arch:10s} cold={baseline[arch]:.3f} -> trained={statistics.mean(per_arch[arch]):.3f}")

# 2b. taste graph coherence: are graph neighbors same-archetype?
print("-" * 64)
print("2) TASTE GRAPH (co-engagement edges from 500 accounts)")
graph_hits, graph_total, coherent = 0, 0, 0
probes = 0
for bot in random.sample(BOTS, 60):
    feed = call("GET", f"/api/feed?user={bot['id']}")
    if not feed or not feed["items"]:
        continue
    best = max(feed["items"][:10], key=lambda it: cos(it.get("tags") or {}, bot["persona"]))
    rel = call("GET", f"/api/related?item={best['id']}&limit=8")
    if not rel:
        continue
    probes += 1
    for x in rel["items"]:
        graph_total += 1
        if x.get("_via") == "graph":
            graph_hits += 1
            if cos(x.get("tags") or {}, bot["persona"]) > 0.35:
                coherent += 1
print(f"   related-item probes: {probes} | graph-sourced neighbors: {graph_hits}/{graph_total}")
if graph_hits:
    print(f"   graph neighbors matching prober's archetype: {coherent}/{graph_hits} ({100*coherent/graph_hits:.0f}%)")

# 2c. popularity transfer to a fresh account
print("-" * 64)
print("3) CROSS-ACCOUNT POPULARITY (fresh user inherits crowd signal)")
fresh = call("GET", "/api/feed?user=fresh-after")
pop_parts = [it["_parts"]["delta"] for it in fresh["items"][:30]]
cold_parts = [it["_parts"]["delta"] for it in cold["items"][:30]]
print(f"   mean delta(popularity) bridge, cold-start world: {statistics.mean(cold_parts):.3f}")
print(f"   mean delta(popularity) bridge, after 500 bots:   {statistics.mean(pop_parts):.3f}")

# 2d. board taste transfer between accounts
print("-" * 64)
print("4) BOARD TASTE TRANSFER (shared moodboard steers a stranger)")
for arch in ["avant", "gorp"]:
    donor = next(b for b in BOTS if b["arch"] == arch)
    boards = call("GET", f"/api/boards?user={donor['id']}")
    board = (boards or {}).get("boards", [])
    board = next((b for b in board if b["items"]), None)
    if not board:
        # find any bot of this archetype with a non-empty board
        for b2 in BOTS:
            if b2["arch"] != arch: continue
            bs = call("GET", f"/api/boards?user={b2['id']}")
            board = next((x for x in (bs or {}).get("boards", []) if x["items"]), None)
            if board: break
    if not board:
        print(f"   {arch}: no boards created, skipped"); continue
    seeded = call("GET", f"/api/feed?user=stranger-{arch}&board={board['id']}")
    a_own = alignment(seeded["items"], ARCHETYPES[arch])
    a_other = alignment(seeded["items"], ARCHETYPES["gorp" if arch == "avant" else "avant"])
    print(f"   {arch} board ({len(board['items'])} items) -> stranger feed: "
          f"alignment to {arch}={a_own:.3f}, to opposite={a_other:.3f}, seeded={seeded['boardSeeded']}")

# 2e. archetype separation
print("-" * 64)
print("5) ARCHETYPE SEPARATION (do different personas see different feeds?)")
feeds = {}
for arch in ["avant", "gorp", "quietlux", "street"]:
    b = next(x for x in BOTS if x["arch"] == arch)
    f = call("GET", f"/api/feed?user={b['id']}")
    feeds[arch] = {it["id"] for it in f["items"]}
pairs = [("avant", "gorp"), ("avant", "quietlux"), ("gorp", "street"), ("quietlux", "street")]
for a, b in pairs:
    ov = len(feeds[a] & feeds[b])
    print(f"   {a} vs {b}: {ov}/60 items overlap")

# 2f. zones: core vs discovery vs far reach
print("-" * 64)
print("6) ZONES (already like / probably like / far reach)")
comp = []
zone_sims = {"core": [], "discovery": [], "reach": []}
zone_latent = {"core": [], "discovery": [], "reach": []}
for bot in random.sample(BOTS, 80):
    f = call("GET", f"/api/feed?user={bot['id']}")
    if not f or not f.get("items"):
        continue
    comp.append(f.get("zones", {}))
    for it in f["items"]:
        z = it.get("_zone", "core")
        tags = it.get("tags") or {}
        zone_sims.setdefault(z, []).append(cos(tags, bot["persona"]))
        zone_latent.setdefault(z, []).append(cos(tags, bot["judge"]))
mix = {k: round(statistics.mean([c.get(k, 0) for c in comp]), 1) for k in ["core", "discovery", "reach"]}
print(f"   mean zone mix per 60-item feed: {mix}")
print("   similarity to declared persona / to latent (adjacent-inclusive) taste:")
for z in ["core", "discovery", "reach"]:
    if zone_sims.get(z):
        print(f"     {z:9s} declared={statistics.mean(zone_sims[z]):.3f}  "
              f"latent={statistics.mean(zone_latent[z]):.3f}  (n={len(zone_sims[z])})")
print("   engagement rate by zone during simulation:")
for z in ["core", "discovery", "reach"]:
    if z in zone_stats:
        s, e = zone_stats[z]
        print(f"     {z:9s} considered {s:5d}, engaged {e:4d} ({100*e/max(1,s):.0f}%)")

# bored user should get 5 far-reach slots instead of 2. Skips must name REAL
# catalog items (the interaction route 400s on unknown ids — the old synthetic
# ids silently broke this probe).
uid = "bored-tester"
seed_feed = call("GET", f"/api/feed?user={uid}&q=quiet%20luxury")
for it in (seed_feed or {}).get("items", [])[:3]:
    call("POST", "/api/interaction",
         {"user": uid, "item": {"id": it["id"], "tags": it.get("tags") or {}},
          "action": "skip", "dwellMs": 300})
fb = call("GET", f"/api/feed?user={uid}")
print(f"   bored user: epsilonAuto={fb['epsilonAuto']}, reach slots={fb['zones']['reach']} (expect 5, normal is 2)")

print("=" * 64)
print(f"TOTAL API CALLS (tests): {CALLS[0]} | errors: {len(ERRORS)}")
if ERRORS[:3]:
    print("sample errors:", ERRORS[:3])

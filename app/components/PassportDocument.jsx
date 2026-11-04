"use client";

// app/components/PassportDocument.jsx — THE PAGE OF THE TASTE PASSPORT, the
// owner's mock-up traced (2 Nov 2026, docs/v2/mocks/2026-11-02-taste-passport/;
// "just trace the picture"): the clouded masthead with the serial and the
// number, the name in the notch, the photo and its word, the seven fields,
// the signature, the account number, the photo's ghost, the bar code, the
// machine zone — every piece placed by app/globals.css in hundredths of
// the page's width, so the document on /board and its preview on /profile
// are the same page at two sizes. Every string comes from
// lib/passport/document.js; nothing here invents a value.
//
// `editable` (the document itself): the photo slot takes a photo, IDNTY
// and DATE OF BIRTH are written on the page, the signature can be signed.
// The preview prints the same page read-only.

import { MrzLine } from "./Blocks.jsx";
import PassportBarcode from "./PassportBarcode.jsx";
import PassportSignature from "./PassportSignature.jsx";
import { nameParts, ocr, passportNumberDisplay, passportWords, serialLine, sinceDisplay, SERIAL_WIDTH } from "../../lib/passport/document.js";

export default function PassportDocument({ uid, info, taste, lang, mrz, photo, editable = false, onPhoto, onWrite }) {
  const { surname, given } = nameParts(info.name);
  const T = (key) => <em lang={lang.code} dir={lang.dir}>{lang[key]}</em>;
  return (
    <>
      <header className="ppmast">
        <MrzLine className="ppserial" text={serialLine(info.since)} width={SERIAL_WIDTH} />
        <span className="ppnum"><i className="ppno" aria-label="number">N<u>o</u></i>{ocr(passportNumberDisplay(uid))}</span>
        <span className="ppcloud" aria-hidden="true" />
      </header>
      <h2 className="pptitle">ASILUM TASTE PASSPORT</h2>
      {editable ? (
        <button className="ppphoto" title="add a bearer photo (stays on this device)" onClick={onPhoto}>
          {photo ? <img src={photo} alt="bearer" /> : <span className="ppphotoempty">◉<em>⇪ ADD PHOTO</em></span>}
        </button>
      ) : (
        <span className="ppphoto" aria-hidden="true">{photo ? <img src={photo} alt="" /> : <span className="ppphotoempty">◉</span>}</span>
      )}
      <dl className="ppid" data-lang={lang.code}>
        <div><dt>SURNAME /{T("surname")}</dt><dd>{surname.toUpperCase() || "—"}</dd></div>
        <div><dt>GIVEN NAME /{T("given")}</dt><dd>{given.toUpperCase() || "—"}</dd></div>
        <div><dt><label htmlFor="ppdob">DATE OF BIRTH /{T("dob")}</label></dt>
          <dd>{editable
            ? <input id="ppdob" className="ppwrite" type="date" value={info.dob || ""} onChange={(e) => onWrite("dob", e.target.value)} aria-label="date of birth, as you write it here (stays on this device)" />
            : (sinceDisplay(info.dob))}</dd></div>
        <div><dt>NATIONALITY /{T("nationality")}</dt><dd>{info.origin || "—"}</dd></div>
        <div><dt><label htmlFor="ppidnty">IDNTY /{T("idnty")}</label></dt>
          <dd>{editable
            ? <input id="ppidnty" className="ppwrite" type="text" maxLength={32} placeholder="—" value={info.idnty || ""} onChange={(e) => onWrite("idnty", e.target.value)} aria-label="IDNTY — whatever you want it to say (stays on this device)" />
            : (info.idnty || "—")}</dd></div>
        <div><dt>TASTE TYPE /{T("taste")}</dt><dd><span className="ppstar">*</span> {taste}</dd></div>
        <div><dt>DATE OF ISSUE /{T("issue")}</dt><dd>{sinceDisplay(info.since)}</dd></div>
      </dl>
      {/* the document's word for itself, four times on two lines — the mock-up's four (lib/passport/document.js
          passportWords), in OCR A with the Os as zeros, as the mock-up sets them */}
      <span className="ppquad">
        {passportWords().map((pair, i) => (
          <span key={i} dir="ltr">{pair.map((w, j) => [j ? <span key={"s" + j}>/</span> : null, <span key={j} lang={w.code} dir={w.dir}>{ocr(w.word)}</span>])}</span>
        ))}
      </span>
      {/* the lower page's left column: the signature, then the account number, in flow (a folded label moves the
          account down with it) */}
      <div className="pplow">
        <PassportSignature name={info.name} label="PASSENGER SIGNATURE" translation={lang.signature} dir={lang.dir} editable={editable} />
        <dl className="ppacct"><div><dt>ACCOUNT NO /{T("account")}</dt><dd>{uid || "—"}</dd></div></dl>
      </div>
      {/* the ghost: the photo again, small, as a negative — a driver's licence's second portrait */}
      <span className="ppghost" aria-hidden="true">{photo ? <img src={photo} alt="" /> : null}</span>
      <span className="ppghostcap" aria-hidden="true">PASSENGER BIOMETRIC</span>
      <PassportBarcode uid={uid} />
      {/* the machine zone at the foot: two lines of the measure, every one a field the data page prints
          (lib/passport/document.js mrzZone), the chevrons the filler, the device's cursor at the end */}
      <div className="ppmrz">
        {mrz.map((line, i) => <MrzLine key={i} text={line} cursor={editable && i === mrz.length - 1} />)}
      </div>
    </>
  );
}

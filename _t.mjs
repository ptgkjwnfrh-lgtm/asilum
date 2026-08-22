import fs from 'node:fs';
const r=JSON.parse(fs.readFileSync('scripts/.vibe-sweep.json','utf8'));
const d=r.filter(x=>x.out==='D');
const by={}; for(const x of d) by[x.cls]=(by[x.cls]||0)+1;
console.log(by);

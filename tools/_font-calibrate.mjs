import path from 'node:path';
import fs from 'node:fs';
const TOOLS = path.resolve('.');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(TOOLS,'browsers');
const libDirs=[path.join(TOOLS,'libs/usr/lib/x86_64-linux-gnu'),path.join(TOOLS,'libs/lib/x86_64-linux-gnu')].filter(d=>fs.existsSync(d));
process.env.LD_LIBRARY_PATH=[...libDirs,process.env.LD_LIBRARY_PATH||''].filter(Boolean).join(':');
const { chromium } = await import('playwright');
const b = await chromium.launch({args:['--no-sandbox','--force-color-profile=srgb','--hide-scrollbars','--disable-lcd-text','--font-render-hinting=none']});
const p = await b.newPage({viewport:{width:800,height:600}});
await p.goto('http://127.0.0.1:5173/users.html',{waitUntil:'load'});
await p.evaluate(async () => { await document.fonts.load('400 20px Inter'); await document.fonts.load('400 20px "Noto Sans SC"'); await document.fonts.ready; });
const cases = [
  // [label, text, family, weight, target ink width CSS px, target ink height CSS px]
  ['h1','用户管理','"Noto Sans SC"',800,113,28],
  ['subtitle','对系统用户进行新增、删除、修改、停用和查询等管理操作','"Noto Sans SC"',400,360.5,14.5],
  ['nav Dashboard','Dashboard','Inter',400,68.5,11],
  ['nav 用户管理','用户管理','"Noto Sans SC"',600,53,13],
  ['brand line1','LLM推理','Inter',700,51.5,12.5],
  ['brand line2','Token 流量管理系统','"Noto Sans SC"',400,120,13],
  ['table admin','admin','Inter',400,41.5,12.5],
  ['table 10001','10001','Inter',400,38,12.5],
  ['table 超级管理员','超级管理员','"Noto Sans SC"',400,74,13.5],
  ['table email','admin@example.com','Inter',400,147,16],
  ['table date','2024-03-12 10:00:00','Inter',400,145.5,12.5],
  ['th 用户ID','用户ID','"Noto Sans SC"',400,43.5,15.5],
  ['th 邮箱/联系方式','邮箱/联系方式','"Noto Sans SC"',400,94.5,15],
  ['pagination text','共 48 条记录，每页 10 条','"Noto Sans SC"',400,171.5,16],
  ['filter placeholder','用户名/用户 ID','"Noto Sans SC"',400,0,0],
  ['button 查询','查询','"Noto Sans SC"',600,0,0],
  ['topbar admin','admin','Inter',500,34.5,9.5],
];
const out = await p.evaluate((cases) => {
  const c = document.createElement('canvas').getContext('2d');
  const res = [];
  for (const [label,text,family,weight,tw,th] of cases) {
    const samples = [];
    for (let size = 10; size <= 40; size += 0.5) {
      c.font = `${weight} ${size}px ${family}`;
      const m = c.measureText(text);
      const inkW = m.actualBoundingBoxRight + m.actualBoundingBoxLeft;
      const inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      samples.push({size, w: +inkW.toFixed(2), h: +inkH.toFixed(2)});
    }
    let best = null;
    if (tw > 0) {
      for (const s of samples) {
        const e = Math.abs(s.w - tw);
        if (!best || e < best.e) best = {...s, e};
      }
    }
    res.push({label, text, family, weight, targetW: tw, targetH: th, best, sample: samples.filter(s=>[12,13,13.5,14,14.5,15,15.5,16,16.5,17,18,20,30,31,32].includes(s.size))});
  }
  return res;
}, cases);
console.log(JSON.stringify(out,null,1));
await b.close();

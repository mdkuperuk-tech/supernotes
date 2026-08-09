/* pdfout.js — a tiny PDF writer. No libraries, so export works offline.
   Each page is rendered to a high-resolution JPEG and embedded with DCTDecode. */

const enc = new TextEncoder();

export function buildPDF(pages, meta = {}) {
  // pages: [{ jpeg: Uint8Array, wpx, hpx }]
  const objs = [];                       // each entry: Uint8Array | string
  const add = o => { objs.push(o); return objs.length; };   // 1-based object number

  const catalogNo = add(null);           // reserve 1
  const pagesNo   = add(null);           // reserve 2
  const kids = [];

  for (const p of pages) {
    const ptW = 595.28;
    const ptH = +(ptW * (p.hpx / p.wpx)).toFixed(2);
    const imgNo = add(streamObj(
      `<</Type /XObject /Subtype /Image /Width ${p.wpx} /Height ${p.hpx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length}>>`,
      p.jpeg
    ));
    const content = enc.encode(`q ${ptW} 0 0 ${ptH} 0 0 cm /Im0 Do Q`);
    const contNo = add(streamObj(`<</Length ${content.length}>>`, content));
    const pageNo = add(`<</Type /Page /Parent ${pagesNo} 0 R /MediaBox [0 0 ${ptW} ${ptH}] /Resources <</XObject <</Im0 ${imgNo} 0 R>>>> /Contents ${contNo} 0 R>>`);
    kids.push(`${pageNo} 0 R`);
  }

  const infoNo = add(`<</Title (${pdfStr(meta.title || 'SuperNotes')}) /Producer (SuperNotes) /CreationDate (${pdfDate(meta.date || new Date())})>>`);

  objs[catalogNo - 1] = `<</Type /Catalog /Pages ${pagesNo} 0 R>>`;
  objs[pagesNo - 1]   = `<</Type /Pages /Count ${kids.length} /Kids [${kids.join(' ')}]>>`;

  /* assemble */
  const chunks = [];
  let len = 0;
  const push = u8 => { chunks.push(u8); len += u8.length; };
  push(enc.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));

  const offsets = [0];
  objs.forEach((o, i) => {
    offsets.push(len);
    push(enc.encode(`${i + 1} 0 obj\n`));
    if (o instanceof Uint8Array) push(o);
    else push(enc.encode(o + '\n'));
    push(enc.encode('endobj\n'));
  });

  const xrefPos = len;
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  xref += `trailer\n<</Size ${objs.length + 1} /Root ${catalogNo} 0 R /Info ${infoNo} 0 R>>\nstartxref\n${xrefPos}\n%%EOF\n`;
  push(enc.encode(xref));

  const out = new Uint8Array(len);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return new Blob([out], { type: 'application/pdf' });
}

function streamObj(dict, data) {
  const head = enc.encode(dict + '\nstream\n');
  const tail = enc.encode('\nendstream\n');
  const u8 = new Uint8Array(head.length + data.length + tail.length);
  u8.set(head, 0); u8.set(data, head.length); u8.set(tail, head.length + data.length);
  return u8;
}
const pdfStr = s => String(s).replace(/([\\()])/g, '\\$1').slice(0, 180);
function pdfDate(d) {
  const p = n => String(n).padStart(2, '0');
  return `D:${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export async function canvasToJPEG(canvas, quality = 0.92) {
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
  return new Uint8Array(await blob.arrayBuffer());
}

/* ---------- sharing ---------- */

export async function shareFile(blob, filename, text) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename, text: text || '' }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
}

export function whatsappLink(text) {
  return 'https://wa.me/?text=' + encodeURIComponent(text);
}
export function mailtoLink(subject, body) {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

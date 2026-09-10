import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlN4VIAAAAASUVORK5CYII=", "base64");
function storedZip(entries) {
  const locals = [], central = []; let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const path = Buffer.from(name), data = Buffer.from(text), local = Buffer.alloc(30), index = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(path.length, 26);
    index.writeUInt32LE(0x02014b50); index.writeUInt16LE(20, 4); index.writeUInt16LE(20, 6); index.writeUInt16LE(0x800, 8);
    index.writeUInt32LE(data.length, 20); index.writeUInt32LE(data.length, 24); index.writeUInt16LE(path.length, 28); index.writeUInt32LE(offset, 42);
    const part = Buffer.concat([local, path, data]); locals.push(part); central.push(Buffer.concat([index, path])); offset += part.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
function pdf() {
  const stream = "BT /F1 20 Tf 35 150 Td (Workbench PDF preview) Tj ET";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 220] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let out = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return out;
}
export async function createWorkbenchFixtures(root) {
  await mkdir(root, { recursive: true });
  const git = (...args) => execFileSync("git", args, { cwd: root, windowsHide: true, stdio: "pipe" });
  git("init", "--initial-branch=main"); git("config", "user.name", "Workbench fixture"); git("config", "user.email", "fixture@example.invalid"); git("config", "core.autocrlf", "false"); git("config", "commit.gpgsign", "false");
  await writeFile(join(root, "sample.ts"), Array.from({ length: 80 }, (_, i) => `export const value${i + 1} = ${i + 1};`).join("\n") + "\n");
  git("add", "."); git("commit", "-m", "fixture baseline"); git("checkout", "-b", "feature");
  await writeFile(join(root, "branch.txt"), "branch commit\n"); git("add", "."); git("commit", "-m", "fixture branch");
  await writeFile(join(root, "sample.ts"), Array.from({ length: 80 }, (_, i) => `export const value${i + 1} = ${i === 4 ? 500 : i + 1};`).join("\n") + "\n");
  await writeFile(join(root, "README.md"), "# Workbench preview\n\nA real Markdown artifact.\n\n[Jump to code](sample.ts:42)\n");
  await writeFile(join(root, "image.png"), png);
  await writeFile(join(root, "preview.html"), '<!doctype html><title>Artifact preview</title><link rel="stylesheet" href="preview.css"><h1>HTML artifact</h1><button id="artifact">Interactive artifact</button><script>document.querySelector("button").onclick=()=>document.querySelector("h1").textContent="Artifact clicked"</script>');
  await writeFile(join(root, "preview.css"), "body{font:18px/1.6 system-ui;padding:32px;background:white;color:#333}");
  await writeFile(join(root, "report.pdf"), pdf());
  await writeFile(join(root, "report.docx"), storedZip({
    "[Content_Types].xml": '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/document.xml": '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Workbench Word document</w:t></w:r></w:p></w:body></w:document>',
  }));
}

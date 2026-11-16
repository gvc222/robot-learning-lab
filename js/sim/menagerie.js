// Loads robot models from MuJoCo Menagerie (vendored and decimated in vendor/menagerie) into MuJoCo's virtual file system.
// Every model's meshes live in <dir>/assets; manifest.json lists them.
const BASE = new URL('../../vendor/menagerie/', import.meta.url);
let manifest = null;

async function readBytes(path) {
  if (typeof window === 'undefined') { const fs = await import('fs'); return new Uint8Array(fs.readFileSync(new URL(path, BASE))); }
  const r = await fetch(new URL(path, BASE)); if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}

// Returns the path of the main XML inside MuJoCo's file system, ready for MjModel.from_xml_path.
// `edit` can rewrite the XML text first (e.g. to add a table and objects to the scene).
export async function stageModel(mj, dir, xmlName, edit = (x) => x) {
  manifest ||= JSON.parse(new TextDecoder().decode(await readBytes('manifest.json')));
  const root = `/menagerie/${dir}`;
  if (!mj.FS.analyzePath(`${root}/assets`).exists) {
    mj.FS.mkdirTree(`${root}/assets`);
    await Promise.all(manifest[dir].map(async (f) => mj.FS.writeFile(`${root}/assets/${f}`, await readBytes(`${dir}/assets/${f}`))));
  }
  const xml = new TextDecoder().decode(await readBytes(`${dir}/${xmlName}`));
  const path = `${root}/_${xmlName}`;
  mj.FS.writeFile(path, edit(xml));
  return path;
}

export const nameOf = (mj, m, kind, i) => mj.mj_id2name(m, mj.mjtObj[kind].value, i);
export const idOf = (mj, m, kind, name) => mj.mj_name2id(m, mj.mjtObj[kind].value, name);

// Учёт модов, которые поставил сам лаунчер (Fabric API, Orange Visuals, зависимости, пакет оптимизации).
// Такие моды скрываются в менеджере модов: их не нужно включать и выключать вручную.
const fs = require('fs');
const path = require('path');
const instances = require('./instances');

function fileOf(inst) {
  return path.join(instances.getGameDir(inst), 'ember-managed.json');
}

// Запись о проекте: { id, versionId, title, files }. Старый формат (только id) сохраняем без файлов:
// такие записи не считаются установленными и удаляются при очистке.
function normProject(p) {
  if (typeof p === 'string') return { id: p, versionId: '', title: '', files: [] };
  if (!p || typeof p.id !== 'string') return null;
  return {
    id: p.id,
    versionId: typeof p.versionId === 'string' ? p.versionId : '',
    title: typeof p.title === 'string' ? p.title : '',
    files: Array.isArray(p.files) ? p.files.filter(x => typeof x === 'string') : [],
  };
}

function read(inst) {
  try {
    const d = JSON.parse(fs.readFileSync(fileOf(inst), 'utf8'));
    return {
      files: Array.isArray(d.files) ? d.files : [],
      packs: Array.isArray(d.packs) ? d.packs : [],
      projects: Array.isArray(d.projects) ? d.projects.map(normProject).filter(Boolean) : [],
    };
  } catch {
    return { files: [], packs: [], projects: [] };
  }
}

function write(inst, data) {
  fs.mkdirSync(path.dirname(fileOf(inst)), { recursive: true });
  fs.writeFileSync(fileOf(inst), JSON.stringify(data, null, 2));
}

function addFiles(inst, names) {
  const d = read(inst);
  d.files = [...new Set([...d.files, ...names])];
  write(inst, d);
}

function addPack(inst, slugs) {
  const d = read(inst);
  d.packs = [...new Set([...d.packs, ...slugs])];
  write(inst, d);
}

// entries: [{ id, versionId, title, files }]. Запись с тем же id заменяется.
function addProjects(inst, entries) {
  const d = read(inst);
  const next = new Map(d.projects.map(p => [p.id, p]));
  for (const e of entries) {
    const p = normProject(e);
    if (p) next.set(p.id, p);
  }
  d.projects = [...next.values()];
  write(inst, d);
}

function setProjects(inst, projects) {
  const d = read(inst);
  d.projects = projects.map(normProject).filter(Boolean);
  write(inst, d);
}

function removeFiles(inst, names) {
  const d = read(inst);
  const drop = new Set(names);
  d.files = d.files.filter(x => !drop.has(x));
  write(inst, d);
}

function isManaged(inst, fileName) {
  return read(inst).files.includes(fileName.replace(/\.disabled$/i, ''));
}

module.exports = { read, addFiles, addPack, addProjects, setProjects, removeFiles, isManaged };

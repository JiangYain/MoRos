const DEVICON_BASE_URL = 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons'
const VSCODE_ICONS_BASE_URL = 'https://cdn.jsdelivr.net/gh/vscode-icons/vscode-icons/icons'

const devicon = (name, variant = 'original') => `${DEVICON_BASE_URL}/${name}/${name}-${variant}.svg`
const vscodeIcon = (fileName) => `${VSCODE_ICONS_BASE_URL}/${fileName}`

const CODE_ICON_BY_EXTENSION = {
  js: devicon('javascript'),
  jsx: devicon('react'),
  ts: devicon('typescript'),
  tsx: devicon('react'),
  py: devicon('python'),
  java: devicon('java'),
  c: devicon('c'),
  h: devicon('c'),
  cpp: devicon('cplusplus'),
  cxx: devicon('cplusplus'),
  cc: devicon('cplusplus'),
  hpp: devicon('cplusplus'),
  cs: devicon('csharp'),
  go: devicon('go'),
  rs: devicon('rust'),
  php: devicon('php'),
  rb: devicon('ruby'),
  swift: devicon('swift'),
  kt: devicon('kotlin'),
  kts: devicon('kotlin'),
  scala: devicon('scala'),
  sh: devicon('bash'),
  bash: devicon('bash'),
  zsh: devicon('bash'),
  ps1: vscodeIcon('file_type_powershell.svg'),
  html: devicon('html5'),
  htm: devicon('html5'),
  css: devicon('css3'),
  scss: devicon('sass'),
  sass: devicon('sass'),
  less: devicon('less'),
  vue: devicon('vuejs'),
  svelte: devicon('svelte'),
  sql: devicon('mysql'),
  r: devicon('r'),
}

const FILE_TYPE_ICON_BY_EXTENSION = {
  md: vscodeIcon('file_type_markdown.svg'),
  markdown: vscodeIcon('file_type_markdown.svg'),
  json: vscodeIcon('file_type_json.svg'),
  excalidraw: vscodeIcon('file_type_svg.svg'),
  yaml: vscodeIcon('file_type_light_yaml_official.svg'),
  yml: vscodeIcon('file_type_light_yaml_official.svg'),
  xml: vscodeIcon('file_type_text.svg'),
  toml: vscodeIcon('file_type_toml.svg'),
  ini: vscodeIcon('file_type_ini.svg'),
  txt: vscodeIcon('file_type_text.svg'),
  log: vscodeIcon('file_type_log.svg'),
  csv: vscodeIcon('file_type_excel.svg'),
  tsv: vscodeIcon('file_type_excel.svg'),
  xls: vscodeIcon('file_type_excel.svg'),
  xlsx: vscodeIcon('file_type_excel.svg'),
  pdf: vscodeIcon('file_type_pdf.svg'),
  doc: vscodeIcon('file_type_libreoffice_writer.svg'),
  docx: vscodeIcon('file_type_libreoffice_writer.svg'),
  odt: vscodeIcon('file_type_libreoffice_writer.svg'),
  ppt: vscodeIcon('file_type_powerpoint.svg'),
  pptx: vscodeIcon('file_type_powerpoint.svg'),
  odp: vscodeIcon('file_type_libreoffice_impress.svg'),
  svg: vscodeIcon('file_type_svg.svg'),
  png: vscodeIcon('file_type_image.svg'),
  jpg: vscodeIcon('file_type_image.svg'),
  jpeg: vscodeIcon('file_type_image.svg'),
  webp: vscodeIcon('file_type_image.svg'),
  gif: vscodeIcon('file_type_image.svg'),
  mp4: vscodeIcon('file_type_image.svg'),
  mov: vscodeIcon('file_type_image.svg'),
  webm: vscodeIcon('file_type_image.svg'),
  mp3: vscodeIcon('file_type_audio.svg'),
  wav: vscodeIcon('file_type_audio.svg'),
}

const DEFAULT_FILE_ICON_URL = vscodeIcon('default_file.svg')
const DEFAULT_FOLDER_ICON_URL = vscodeIcon('default_folder.svg')
const URL_ICON_URL = vscodeIcon('file_type_http.svg')

export const getFileExtension = (pathOrName) => {
  const normalized = String(pathOrName || '')
    .trim()
    .split(/[?#]/)[0]
    .split(/[\\/]/)
    .pop() || ''
  const dotIndex = normalized.lastIndexOf('.')
  if (dotIndex < 0) return ''
  return normalized.slice(dotIndex + 1).toLowerCase()
}

export const resolveFileIconUrl = ({ pathValue, nameValue, isFolder = false, isUrl = false }) => {
  if (isFolder) return DEFAULT_FOLDER_ICON_URL
  if (isUrl) return URL_ICON_URL
  const extension = getFileExtension(pathValue || nameValue)
  if (!extension) return DEFAULT_FILE_ICON_URL
  return (
    CODE_ICON_BY_EXTENSION[extension]
    || FILE_TYPE_ICON_BY_EXTENSION[extension]
    || DEFAULT_FILE_ICON_URL
  )
}

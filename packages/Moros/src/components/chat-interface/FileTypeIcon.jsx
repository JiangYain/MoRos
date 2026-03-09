import React, { useEffect, useMemo, useState } from 'react'
import { resolveFileIconUrl, getFileExtension } from './fileIcons'

function FileTypeIcon({
  pathValue = '',
  nameValue = '',
  isFolder = false,
  isUrl = false,
  className = '',
}) {
  const iconUrl = useMemo(
    () => resolveFileIconUrl({ pathValue, nameValue, isFolder, isUrl }),
    [pathValue, nameValue, isFolder, isUrl],
  )
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    setLoadFailed(false)
  }, [iconUrl])

  const extension = getFileExtension(pathValue || nameValue)
  const fallbackText = (extension || String(nameValue || pathValue || '?').slice(0, 2)).toUpperCase()

  if (!iconUrl || loadFailed) {
    return (
      <span className={`chat-file-icon-fallback ${className}`.trim()} aria-hidden>
        {fallbackText || '??'}
      </span>
    )
  }

  return (
    <img
      src={iconUrl}
      alt=""
      className={className}
      loading="lazy"
      onError={() => setLoadFailed(true)}
    />
  )
}

export default FileTypeIcon

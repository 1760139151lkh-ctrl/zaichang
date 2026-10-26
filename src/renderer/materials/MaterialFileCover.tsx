import { FileText } from 'lucide-react';
import './material-file-cover.css';

/** A file mark identifies its original document; it never stands in for a
 * rendered PDF page or implies that its body has been read by the model. */
export function MaterialFileCover({ mediaType, size = 'small', label, coverKey }: {
  mediaType?: string;
  size?: 'small' | 'regular';
  label?: string;
  /** A stable visual distinction, never a description of the file's body. */
  coverKey?: string;
}) {
  const pdf = mediaType === 'application/pdf';
  const orbit = !!coverKey && Array.from(coverKey).reduce((sum, point) => (sum * 31 + point.codePointAt(0)!) >>> 0, 0) % 2 === 1;
  return <span className={`material-file-cover is-${size}${pdf ? ` is-pdf${orbit ? ' has-orbit' : ' has-curve'}` : ''}`} role="img"
    aria-label={label || (pdf ? 'PDF 文件' : '文字资料')}>
    {pdf ? <svg className="material-file-cover-art" viewBox="0 0 32 40" fill="none" aria-hidden="true">
      {orbit ? <><circle cx="17" cy="20" r="9" /><path d="M17 7V33M5 20H29M10 29 25 12" /></>
        : <path d="M7 30C12 29 14 26 15 22C16 17 20 17 22 14C24 12 25 9 26 7" />}
    </svg> : <FileText size={size === 'regular' ? 20 : 15} aria-hidden="true" />}
  </span>;
}

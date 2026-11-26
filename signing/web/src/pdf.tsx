import type { PDFPageProxy } from 'pdfjs-dist';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { HTMLAttributes, ReactNode, useEffect, useRef, useState } from 'react';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** The pages of a PDF, loaded once per `key`. */
export function usePages(source: Parameters<typeof pdfjs.getDocument>[0] | null | undefined, key: string | undefined): PDFPageProxy[] {
  const [pages, setPages] = useState<PDFPageProxy[]>([]);
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    pdfjs.getDocument(source).promise.then(async (pdf) => {
      const list: PDFPageProxy[] = [];
      for (let n = 1; n <= pdf.numPages; n++) list.push(await pdf.getPage(n));
      if (!cancelled) setPages(list);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return pages;
}

/**
 * One PDF page on a canvas, with whatever `children(scale, pageHeight)` returns laid over it.
 * PDF points run from the bottom-left; CSS from the top-left: top = (pageHeight - y - height) * scale.
 */
interface PageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  page: PDFPageProxy;
  children: (scale: number, pageHeight: number) => ReactNode;
}

export function Page({ page, children, ...rest }: PageProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(1.5, (Math.min(window.innerWidth, 1000) - 32) / base.width);
  useEffect(() => {
    const viewport = page.getViewport({ scale: scale * devicePixelRatio });
    const c = canvas.current!;
    c.width = viewport.width;
    c.height = viewport.height;
    const task = page.render({ canvasContext: c.getContext('2d')!, viewport });
    task.promise.catch(() => {});
    return () => task.cancel();
  }, [page, scale]);
  return (
    <div className="page" style={{ width: base.width * scale, height: base.height * scale }} {...rest}>
      <canvas ref={canvas} style={{ width: '100%', height: '100%' }} />
      {children(scale, base.height)}
    </div>
  );
}

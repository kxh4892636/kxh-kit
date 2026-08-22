import { useEffect, useRef } from "react";

interface CursorFileTarget {
  key: string;
  filePath: string;
}

interface UseCursorFileMountOptions {
  target: CursorFileTarget | null;
  windowReady: boolean;
  mounted: boolean;
  ensureFileMounted: (filePath: string) => void;
}

/** cursor 目标变化时只确保一次；随后手动滚离目标不会被窗口变化拉回。 */
export const useCursorFileMount = (options: UseCursorFileMountOptions): void => {
  const { target, windowReady, mounted, ensureFileMounted } = options;
  const handledTargetKeyRef = useRef<string | null>(null);

  useEffect((): void => {
    if (!target) {
      handledTargetKeyRef.current = null;
      return;
    }
    if (!windowReady || handledTargetKeyRef.current === target.key) return;

    handledTargetKeyRef.current = target.key;
    if (!mounted) ensureFileMounted(target.filePath);
  }, [ensureFileMounted, mounted, target, windowReady]);
};

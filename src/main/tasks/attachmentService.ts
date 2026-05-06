import { copyFileSync, existsSync, mkdirSync } from "fs";
import { join, extname, basename } from "path";

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"];
const VIDEO_EXTS = [".mp4", ".mov", ".avi", ".mkv", ".webm"];

export function detectFileType(fileName: string): "image" | "doc" | "video" {
  const ext = extname(fileName).toLowerCase();
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (VIDEO_EXTS.includes(ext)) return "video";
  return "doc";
}

export function copyAttachment(
  srcPath: string,
  vaultPath: string,
): {
  fileName: string;
  filePath: string;
  fileType: "image" | "doc" | "video";
} {
  const fileName = basename(srcPath);
  const fileType = detectFileType(fileName);
  const destDir = join(vaultPath, "_Assets", fileType);
  mkdirSync(destDir, { recursive: true });

  let destFileName = fileName;
  let destPath = join(destDir, destFileName);

  if (existsSync(destPath)) {
    const ext = extname(fileName);
    const name = basename(fileName, ext);
    destFileName = `${name}-${Date.now()}${ext}`;
    destPath = join(destDir, destFileName);
  }

  copyFileSync(srcPath, destPath);
  const relativePath = `_Assets/${fileType}/${destFileName}`;
  return { fileName, filePath: relativePath, fileType };
}

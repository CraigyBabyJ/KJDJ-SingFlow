#!/usr/bin/env bash
set -euo pipefail

ROOT_DEFAULT="/mnt/media/Drive Media E/Karaoke"

usage() {
  cat <<'EOF'
Usage: normalize-mp4.sh [--in-place] [root-dir]

Scans for .mp4 files under <root-dir>. If the video codec is not h264 or the
pixel format is not yuv420p, it re-encodes to H.264 + AAC.

By default, writes a new file with " [H264]" before the extension.
Use --in-place to replace the original (keeps a .bak copy).

Default root: /mnt/media/Drive Media E/Karaoke

Requires: ffprobe, ffmpeg
EOF
}

in_place=1
if [[ "${1:-}" == "--copy" ]]; then
  in_place=0
  shift
fi

root="${1:-$ROOT_DEFAULT}"

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffprobe not found on PATH" >&2
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found on PATH" >&2
  exit 1
fi

while IFS= read -r -d '' file; do
  codec_name="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=nw=1 "$file" | awk -F= 'NR==1{print $2}')"
  pix_fmt="$(ffprobe -v error -select_streams v:0 -show_entries stream=pix_fmt -of default=nw=1 "$file" | awk -F= 'NR==1{print $2}')"

  if [[ "$codec_name" == "h264" && "$pix_fmt" == "yuv420p" ]]; then
    echo "OK: $file"
    continue
  fi

  echo "CONVERT: $file (codec=$codec_name pix_fmt=$pix_fmt)"
  dir="$(dirname "$file")"
  base="$(basename "$file" .mp4)"

  if [[ $in_place -eq 1 ]]; then
    tmp="${dir}/${base}.tmp.mp4"
    ffmpeg -nostdin -y -i "$file" \
      -c:v libx264 -pix_fmt yuv420p -crf 20 -preset medium \
      -c:a aac -b:a 192k \
      "$tmp"
    mv "$file" "${file}.bak"
    mv "$tmp" "$file"
  else
    out="${dir}/${base} [H264].mp4"
    ffmpeg -nostdin -y -i "$file" \
      -c:v libx264 -pix_fmt yuv420p -crf 20 -preset medium \
      -c:a aac -b:a 192k \
      "$out"
  fi
done < <(find "$root" -type f -name "*.mp4" -print0)

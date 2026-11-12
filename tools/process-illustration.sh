#!/usr/bin/env bash
# One generated PNG (transparent background) → the files a page uses:
#   <name>-280.webp, <name>-560.webp           colour, for walked/open places
#   <name>-grey-280.webp, <name>-grey-560.webp warm grey, for closed places
#   design/illustrations/source/<name>.webp    master
# Crop: the alpha bounding box (alpha > 4%) plus 10px. Needs ImageMagick.
# Usage: tools/process-illustration.sh input.png name public/illustrations/scenery
set -euo pipefail
in=$1; name=$2; dir=${3:-public/illustrations}
mkdir -p "$dir" design/illustrations/source
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
bb=$(convert "$in" -alpha extract -threshold 4% -format "%@" info:)
w=${bb%%x*}; rest=${bb#*x}; h=${rest%%+*}; xy=${rest#*+}; x=${xy%%+*}; y=${xy#*+}
x0=$(( x > 10 ? x - 10 : 0 )); y0=$(( y > 10 ? y - 10 : 0 ))
convert "$in" -crop "$((w + 20))x$((h + 20))+${x0}+${y0}" +repage "$tmp/crop.png"
for s in 280 560; do
  convert "$tmp/crop.png" -resize "${s}x" -quality 86 -define webp:alpha-quality=100 "$dir/$name-$s.webp"
  convert "$tmp/crop.png" -resize "${s}x" \( +clone -alpha extract -evaluate multiply 0.62 \) -alpha off \
    \( -clone 0 -modulate 100,0,100 -fill '#B8A890' -colorize 22% -brightness-contrast 10x-14 \) -delete 0 +swap \
    -compose CopyOpacity -composite -quality 86 -define webp:alpha-quality=100 "$dir/$name-grey-$s.webp"
done
convert "$in" -quality 92 "design/illustrations/source/$name.webp"
identify -format "%f %wx%h\n" "$dir/$name-560.webp"

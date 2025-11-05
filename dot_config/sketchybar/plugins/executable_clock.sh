#!/bin/sh

# The $NAME variable is passed from sketchybar and holds the name of
# the item invoking this script:
# https://felixkratz.github.io/SketchyBar/config/events#events-and-scripting

# sketchybar --set "$NAME" label="$(date '+%a %b %e ')"
source "$CONFIG_DIR/colors.sh"

sketchybar --set "$NAME" label="$(date '+%d %b %I:%M %p')" icon.color="$GREY" label.color="$GREY"

# Front End Companion — Build 011

Build 011 fixes the reason Build 010 found no meal breaks.

In the Woolworths Daily Grid PDF, each paired X marker is printed on the role line directly below the team member's name. At PDF.js scale 2, that is about 27 pixels away. Build 010 only searched within 22 pixels.

Build 011:
- preserves the working date, names and real shift bars;
- groups X markers by their actual PDF row;
- assigns the closest paired X row to the matching team member;
- places one circled M at the centre of the detected meal break;
- leaves staff without an encoded meal break blank.

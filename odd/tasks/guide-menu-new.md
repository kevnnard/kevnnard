# Guide menu: TV, Collection, Cherry
Add the new places to the world's guide menu so visitors discover them and can reach them by keyboard, keeping the menu's current order and style.

## Specs
S1. "todo eso loas urnasn el tv chery quedara en el menu o no hace falta ?" Parent proposal: three tabs (TV, Collection, Cherry) like the existing ones, each with a short text, an illustration and a button that takes you there.
S2. "dale revisa como funnciona el menu para que agreuegs entonces todo eso sin asturar o danar el menu si no bien ornedao conommo esta como tipo titual si"

## Tasks
T1 [S1, S2] DONE — Map WorldMenu + world-guide first, then add TV, Collection and Cherry sections with actions, keeping the tab bar uncluttered and ordered like today.

## Log
L1. Current tabs: Kevnnard Home, Controls, Terminal, Video, Kevnnard Lo-fi, Credits (src/lib/world/world-guide.ts; WorldMenu.tsx renders tabs, GuidePanel offers each section's actions from GuideActions). The owner did not choose the Cherry button behaviour; parent decision: if it is morning, fly to her; otherwise move the world clock to 08:00 (the same clock control the scene panel uses) and fly to her, with the button labelled so the time change is clear.

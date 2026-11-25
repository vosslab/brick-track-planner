# Ballast recipe sources

[ballast_recipes.json](ballast_recipes.json) records the parts that attach to a single track
section. Quantities cover the ballast assembly. Track elements and separate baseplate substrates
have their own inventories. [build_references.json](build_references.json) links complete
arrangements to instructions that cannot honestly be represented as a one-piece recipe. Material
identity is the LEGO design ID and color together.

| L-Gauge sheet | Catalog track IDs | Ballast pieces per track |
| --- | --- | --- |
| [022A R104 curve](https://l-gauge.org/downloads/Ref022BallastR104CurveRevA.pdf) | `bricktracks:r104`, `trixbrix:r104` | 71 |
| [023B R120 curve](https://l-gauge.org/downloads/Ref023BallastR120CurveRevB.pdf) | `bricktracks:r120` | 98 |

Sheets 022A and 023B name the supported products. The catalog includes BrickTracks R104PFDBG8,
TrixBrix R104, and BrickTracks R120PFDBG8. Sheet 022A's cover count includes the track shown in
step 1. Sheet 023B's cover count matches the added pieces, with the track shown separately in step 1.

The curve sheets print color-specific LEGO element IDs. The mappings below link those original
numbers to the design IDs and color names used in the recipe.

| Element ID | Design ID | Color |
| --- | --- | --- |
| 307026 | 3070 | Black |
| 243126 | 2431 | Black |
| 4210719 | 3024 | Dark bluish gray |
| 4210967 | 4510 | Dark bluish gray |
| 4211094 | 3022 | Dark bluish gray |
| 4210635 | 2420 | Dark bluish gray |
| 4211043 | 3021 | Dark bluish gray |
| 4211065 | 3020 | Dark bluish gray |
| 4211002 | 3795 | Dark bluish gray |
| 4227392 | 30357 | Black |
| 4216581 | 6141 | Reddish brown |
| 4211475 | 4032 | Light bluish gray |
| 4543086 | 32028 | Dark bluish gray |
| 4211001 | 3710 | Dark bluish gray |

## Switch and return-curve build references

[Sheet 016A](https://l-gauge.org/downloads/Ref016BallastSwitchRightEvenRevA.pdf) documents a
ballasted right switch and its baseplate substrate. The planner links it only to the complete
`lego:rc-r40-right-switch-return` arrangement, which uses genuine LEGO RC/PF track. Sheet 016A is
a construction reference, not a track-piece recipe, because the switch body and its branch geometry
vary by manufacturer.

[Sheet 017A](https://l-gauge.org/downloads/Ref017BallastRightReturnCurveRevA.pdf) is the companion
ballasted right return-curve **substrate**. The member sheet shows it with Sheet 016A only for the
same genuine LEGO RC/PF arrangement. It does not supply a rail return curve and it is not evidence
that an R104 or other vendor-specific return geometry closes without the catalog's connector check.

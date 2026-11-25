#!/usr/bin/env python3
"""Project selected LDraw parts into compact, layered SVG artwork."""

import collections
import collections.abc
import functools
import itertools
import json
import math
import pathlib
import sys

import shapely
import shapely.geometry
import shapely.geometry.base


type Point = tuple[float, float, float]
type Transform = collections.abc.Callable[[Point], Point]
type Face = tuple[float, str, shapely.geometry.Polygon]

# Register the models' mating planes to the catalog's local studs and axes.
MODELS = {
	"lego:rc-s16": ("53401.dat", 0, 0, 0),
	"lego:rc-r40": ("53400.dat", -0.383887097, -0.606411228, 11.25),
	"lego:rc-r40-right-switch": ("53404c01.dat", -0.9375, -6.375, 0),
	"lego:rc-r40-left-switch": ("53407c01.dat", -0.9375, 6.375, 0),
	"bricktracks:r104": ("BrickTracksR104.dat", 9.399214163, 3.022402515, -78.75),
	"bricktracks:r120": ("BrickTracksR120.dat", 10.721886486, 3.387534823, -78.75),
}
DATA = pathlib.Path(__file__).resolve().parents[1] / "data" / "ldraw"
GRID = 0.001  # Studs.


def subpart_transform(parent: Transform, values: list[float]) -> Transform:
	x, y, z, a, b, c, d, e, f, g, h, i = values

	def place(point: Point) -> Point:
		px, py, pz = point
		return parent((x + a * px + b * py + c * pz, y + d * px + e * py + f * pz, z + g * px + h * py + i * pz))

	return place


def plan_transform(x: float, y: float, angle: float) -> Transform:
	cos, sin = math.cos(math.radians(angle)), math.sin(math.radians(angle))

	def project(point: Point) -> Point:
		px, py, pz = point
		return x + (cos * px + sin * pz) / 20, py / 20, y + (sin * px - cos * pz) / 20

	return project


def faces(
	load: collections.abc.Callable[[str], list[str]], name: str, transform: Transform, paint: str,
) -> collections.abc.Iterator[Face]:
	for record in load(name):
		fields = record.split()
		if not fields or fields[0] not in ("1", "3", "4"):
			continue
		kind, color, *values = fields
		color = paint if color == "16" else color
		if kind == "1":
			child = " ".join(values[12:]).lower().replace("\\", "/")
			yield from faces(load, child, subpart_transform(transform, list(map(float, values[:12]))), color)
			continue
		coords = list(map(float, values))
		points = [transform((coords[i], coords[i + 1], coords[i + 2])) for i in range(0, len(coords), 3)]
		first, second, third = points[:3]
		ax, ay, az = (b - a for a, b in zip(first, second))
		bx, by, bz = (b - a for a, b in zip(first, third))
		area = ax * bz - az * bx
		if abs(area) < 0.000001:
			continue
		slope = abs(area) / math.hypot(ay * bz - az * by, area, ax * by - ay * bx)
		depth = sum(point[1] for point in points) / len(points)
		shape = shapely.geometry.Polygon([(x, z) for x, _, z in points])
		if not shape.is_valid:
			continue
		if color == "14":
			fill = "gold-edge" if slope < 0.86 else "gold"
		elif slope < 0.86:
			fill = "bevel"
		elif depth < -0.5:
			fill = "top"
		elif depth < -0.12:
			fill = "middle"
		else:
			fill = "body"
		yield depth, fill, shape


def polygons(shape: shapely.geometry.base.BaseGeometry) -> collections.abc.Iterator[shapely.geometry.Polygon]:
	if isinstance(shape, shapely.geometry.Polygon) and not shape.is_empty:
		yield shape
	elif hasattr(shape, "geoms"):
		for child in shape.geoms:
			yield from polygons(child)


def path(shape: shapely.geometry.base.BaseGeometry) -> str:
	result = "".join(
		"M" + "L".join(f"{x:g} {y:g}" for x, y in list(ring.coords)[:-1]) + "Z"
		for polygon in polygons(shape)
		for ring in (polygon.exterior, *polygon.interiors)
	)
	return result


def artwork(facets: collections.abc.Iterator[Face]) -> dict[str, str]:
	# shortcut: sort by face center, use a depth buffer if intersecting slopes become visible.
	colored = collections.defaultdict(list)
	covered = shapely.geometry.Polygon()
	ordered = sorted(facets, key=lambda face: face[0])
	if not ordered:
		raise ValueError("LDraw part has no projected faces")
	for fill, layer in itertools.groupby(ordered, key=lambda face: face[1]):
		front = shapely.union_all([shape for _, _, shape in layer], grid_size=GRID)
		colored[fill].append(shapely.difference(front, covered, grid_size=GRID))
		covered = shapely.union(covered, front, grid_size=GRID)
	drawing = {fill: path(shapely.union_all(shapes, grid_size=GRID)) for fill, shapes in colored.items()}
	drawing["outline"] = path(covered)
	return drawing


def main() -> None:
	if len(sys.argv) != 2:
		raise SystemExit("Usage: python3 devel/render_track_artwork.py /path/to/ldraw")
	library = pathlib.Path(sys.argv[1])
	curves = json.loads((DATA / "bricktracks_models.json").read_text())
	authors = set()

	@functools.cache
	def load(name: str) -> list[str]:
		if name in curves:
			records = curves[name]
		else:
			folders = (library / "parts", library / "p")
			file = next((folder / name for folder in folders if (folder / name).is_file()), None)
			if file is None:
				raise FileNotFoundError(f"Missing LDraw dependency {name}")
			records = file.read_text(encoding="utf-8-sig").splitlines()
		authors.update(line[10:].strip() for line in records if line.startswith("0 Author: "))
		return records

	drawings = {
		part: artwork(faces(load, file, plan_transform(x, y, angle), "72"))
		for part, (file, x, y, angle) in MODELS.items()
	}
	(DATA / "track_artwork.json").write_text(json.dumps(drawings, indent=2) + "\n")
	print("Authors:", ", ".join(sorted(authors)))


if __name__ == "__main__":
	main()

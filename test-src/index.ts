import { TestDashboard } from "../src/testing/TestDashboard";
import { QuadTreeTest } from "./trees/QuadTreeTest";
import { QuadTreePerformanceTest } from "./trees/QuadTreePerformanceTest";
import { RectTest } from "./geometries/RectTest";
import { PolygonTest } from "./geometries/PolygonTest";
import { VectorTest } from "./geometries/VectorTest";
import { RayTest } from "./geometries/RayTest";
import { AssertNeverTest } from "./flow/AssertNeverTest";
import { ThrottlerTest } from "./flow/ThrottlerTest";
import { MenuTest } from "./ui/MenuTest";
import { GalleryTest } from "./ui/GalleryTest";
import { ControlPanelTest } from "./ui/ControlPanelTest";
import { ThemeTest } from "./ui/ThemeTest";
import { AssetManagerTest } from "./assets/AssetManagerTest";
import { ColorTest } from "./commons/ColorTest";
import { SignalSocketTest } from "./signals/SignalSocketTest";
import { SweepingSatWorldTest } from "./physics/SweepingSatWorldTest";
import { PlaygroundTest } from "./PlaygroundTest";

const element = document.getElementById("test-dashboard");
if (!element) throw new Error("Element not found");
const dashboard = new TestDashboard();
element.append(dashboard.get_element());

dashboard.add_test([
    new PlaygroundTest(),
    new SweepingSatWorldTest(),
    new QuadTreeTest(),
    new QuadTreePerformanceTest(),
    new RectTest(),
    new PolygonTest(),
    new VectorTest(),
    new RayTest(),
    new AssertNeverTest(),
    new ThrottlerTest(),
    new SignalSocketTest(),
    new MenuTest(),
    new ControlPanelTest(),
    new ThemeTest(),
    new GalleryTest(),
    new ColorTest(),
    new AssetManagerTest(),
]);

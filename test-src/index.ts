import { TestDashboard } from "../src/testing/TestDashboard";
import { QuadTreeTest } from "./trees/QuadTreeTest";
import { RectTest } from "./geometries/RectTest";

const element = document.getElementById('test-dashboard');
if (!element) throw new Error('Element not found');
const dashboard = new TestDashboard();
element.append(dashboard.get_element());

dashboard.add_test([
    new QuadTreeTest(),
    new RectTest(),
]);

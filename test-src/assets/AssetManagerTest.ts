import { TestClass } from "../../src";
import { AssetManager, Progress } from "../../src";

export class AssetManagerTest extends TestClass {
    public get_name(): string {
        return "Asset Manager Test";
    }

    public async test_loading_assets() {
        const asset_manager = new AssetManager();
        const progress = new Progress();

        let last_percent = 0;
        progress.listen((percent) => {
            last_percent = percent;
            console.log(`Loading progress: ${(percent * 100).toFixed(2)}%`);
        });

        // Use placeholder images that should load correctly
        const assets = {
            images: {
                logo: "https://via.placeholder.com/150",
                icon: "https://via.placeholder.com/50",
            },
        };

        console.log("Starting asset load...");
        await asset_manager.load(assets, progress);
        console.log("Asset load finished.");

        this.assert_true(asset_manager.images.has("logo"));
        this.assert_true(asset_manager.images.has("icon"));
        this.assert_equals(last_percent, 1);
        this.assert_equals(asset_manager.list_pending().length, 0);
    }

    public async test_error_handling() {
        const asset_manager = new AssetManager();
        const progress = new Progress();

        // This URL should fail
        const assets = {
            images: {
                invalid: "https://invalid-url-that-does-not-exist.png",
            },
        };

        console.log("Starting invalid asset load...");
        try {
            await asset_manager.load(assets, progress);
            this.assert_true(false); // Should have failed
        } catch {
            console.log("Caught expected error during load");
            this.assert_true(true);
        }

        this.assert_true(asset_manager.images.has("invalid"));
        this.assert_equals(progress.get_percent(), 1);
    }
}

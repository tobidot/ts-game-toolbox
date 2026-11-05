import { Asset } from "../assets/manager/AssetManager";
import { Button } from "../ui/widgets/Button";
import { HOUSE_COLORS } from "./CanvasGameSettings";

/** How much of the button's shorter side the icon fills. */
const ICON_SHARE = 38 / 56;

/**
 * A toolbox button with an icon for a label, and a strike across it while its channel is off. The
 * shell builds it for a game with sound (`properties.sound_button`, `properties.music_button`). It
 * stays on top of the game's widgets, for painting and for hits, however they are placed.
 */
export class MuteButton extends Button {
    public icon: Asset<HTMLImageElement> | null = null;

    public constructor() {
        super("", { left: 0, top: 0, width: 0, height: 0 });
        this.class = "primary";
        this.stays_on_top = true;
    }

    /** Whether the button shows its channel as off. */
    public get is_off(): boolean {
        return this.class === "off";
    }

    public set is_off(is_off: boolean) {
        if (is_off !== this.is_off) {
            this.class = is_off ? "off" : "primary";
        }
    }

    public override draw(context: CanvasRenderingContext2D): void {
        if (!this.is_visible) {
            return;
        }
        super.draw(context);
        const size = Math.min(this.rect.width, this.rect.height) * ICON_SHARE;
        const half = size / 2;
        context.save();
        this.apply_transforms(context);
        if (this.icon?.ready) {
            context.globalAlpha = this.is_off ? 0.45 : 1;
            context.drawImage(this.icon.element, -half, -half, size, size);
            context.globalAlpha = 1;
        }
        if (this.is_off) {
            context.strokeStyle = HOUSE_COLORS.orange;
            context.lineWidth = size / 6;
            context.lineCap = "round";
            context.beginPath();
            context.moveTo(-half, -half);
            context.lineTo(half, half);
            context.stroke();
        }
        context.restore();
    }
}

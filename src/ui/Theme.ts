export interface ThemeProperties {
    background_color: string;
    hover_color: string;
    active_color: string;
    border_color: string;
    text_color: string;
    font: string;
    label_font: string;
    secondary_font: string;
    panel_color: string;
}

export class Theme implements Partial<ThemeProperties> {
    public background_color?: string;
    public hover_color?: string;
    public active_color?: string;
    public border_color?: string;
    public text_color?: string;
    public font?: string;
    public label_font?: string;
    public secondary_font?: string;
    public panel_color?: string;

    public constructor(init?: Partial<Theme>) {
        if (init) {
            Object.assign(this, init);
        }
    }
}

export const DEFAULT_THEME = new Theme({
    background_color: "#ccc",
    hover_color: "#999",
    active_color: "#666",
    border_color: "#333",
    text_color: "#000",
    font: "16px Arial",
    label_font: "14px Arial",
    secondary_font: "12px Arial",
    panel_color: "rgba(255, 255, 255, 0.8)",
});

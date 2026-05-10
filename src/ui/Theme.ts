export class Theme {
    public backgroundColor?: string;
    public hoverColor?: string;
    public activeColor?: string;
    public borderColor?: string;
    public textColor?: string;
    public font?: string;
    public labelFont?: string;
    public secondaryFont?: string;
    public panelColor?: string;

    public constructor(init?: Partial<Theme>) {
        if (init) {
            Object.assign(this, init);
        }
    }
}

export const DefaultTheme = new Theme({
    backgroundColor: "#ccc",
    hoverColor: "#999",
    activeColor: "#666",
    borderColor: "#333",
    textColor: "#000",
    font: "16px Arial",
    labelFont: "14px Arial",
    secondaryFont: "12px Arial",
    panelColor: "rgba(255, 255, 255, 0.8)",
});

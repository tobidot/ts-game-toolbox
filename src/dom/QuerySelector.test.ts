import { describe, it, expect } from "vitest";
import { get_element_by_id } from "./QuerySelector.ts";

describe("QuerySelector", () => {
    describe("get_element_by_id", () => {
        it("should find element by id on document when only id is provided", () => {
            const mockElement = document.createElement("div");
            mockElement.id = "test-id";
            document.body.appendChild(mockElement);

            const result = get_element_by_id("test-id");
            expect(result).toBe(mockElement);

            document.body.removeChild(mockElement);
        });

        it("should find element by id and check class when id and class are provided", () => {
            class MyElement extends HTMLElement {}
            if (!customElements.get("my-element")) {
                customElements.define("my-element", MyElement);
            }

            const mockElement = document.createElement(
                "my-element",
            ) as MyElement;
            mockElement.id = "test-id-class";
            document.body.appendChild(mockElement);

            const result = get_element_by_id("test-id-class", MyElement);
            expect(result).toBe(mockElement);
            expect(result).toBeInstanceOf(MyElement);

            document.body.removeChild(mockElement);
        });

        it("should throw error if element not found", () => {
            expect(() => get_element_by_id("non-existent")).toThrow(
                "Element not found #non-existent",
            );
        });
    });
});

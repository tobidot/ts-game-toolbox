import { describe, it, expect } from "vitest";
import { get_element_by_id } from "./QuerySelector.ts";

describe("QuerySelector", () => {
    describe("get_element_by_id", () => {
        it("should find element by id on document when only id is provided", () => {
            const mock_element = document.createElement("div");
            mock_element.id = "test-id";
            document.body.appendChild(mock_element);

            const result = get_element_by_id("test-id");
            expect(result).toBe(mock_element);

            document.body.removeChild(mock_element);
        });

        it("should find element by id and check class when id and class are provided", () => {
            class MyElement extends HTMLElement {}
            if (!customElements.get("my-element")) {
                customElements.define("my-element", MyElement);
            }

            const mock_element = document.createElement(
                "my-element",
            ) as MyElement;
            mock_element.id = "test-id-class";
            document.body.appendChild(mock_element);

            const result = get_element_by_id("test-id-class", MyElement);
            expect(result).toBe(mock_element);
            expect(result).toBeInstanceOf(MyElement);

            document.body.removeChild(mock_element);
        });

        it("should throw error if element not found", () => {
            expect(() => get_element_by_id("non-existent")).toThrow(
                "Element not found #non-existent",
            );
        });
    });
});

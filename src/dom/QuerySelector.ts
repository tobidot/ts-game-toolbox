import { is_function, is_object, is_string, is_undefined } from "../flow";
import { Class } from "../flow/types/Class";

/**
 * This should include `document` and any `Element`
 */
interface HasQuerySelector {
    querySelector(selector: string): Element | null;
}
/**
 * This should include `document` and any `Element`
 */
interface HasIdSelector {
    getElementById(id: string): Element | null;
}
/**
 * This should include `document` and any `Element`
 */
interface HasClassSelector {
    getElementsByClassName(classname: string): HTMLCollection;
}

/**
 * Do a query selection on a root element expecting a specific type of element.
 * 
 * @param root 
 * @param selector 
 */
export function get_element_by_query_selector(root: HasQuerySelector, selector: string): HTMLElement;
export function get_element_by_query_selector<T extends HTMLElement>(root: HasQuerySelector, selector: string, class_type: Class<T>): T;
export function get_element_by_query_selector<T extends HTMLElement>(
    root: HasQuerySelector,
    selector: string,
    class_type?: Class<T>
): T {
    const element = root.querySelector(selector);
    if (!element) {
        throw new Error("Element not found" + selector);
    }
    if (!is_of_class_or_html_element<T>(element, class_type)) {
        throw new Error("Element not of required type HTML Element " + (class_type?.name ?? 'HtmlElement'));
    }
    return element;
}

/**
 * Do a query selection on a root element expecting a specific type of element.
 * 
 * @param root 
 * @param selector 
 */
export function get_element_by_id(id: string): HTMLElement;
export function get_element_by_id<T extends HTMLElement>(id: string, class_type: Class<T>): T;
export function get_element_by_id<T extends HTMLElement>(root: HasIdSelector, id: string, class_type: Class<T>): T;
export function get_element_by_id<T extends HTMLElement>(
    root: string | HasIdSelector,
    id?: string | Class<T>,
    class_type?: Class<T>,
): T {
    const {
        _root,
        _id,
        _class_type
    } = ((): {
        _root: HasIdSelector,
        _id: string,
        _class_type: Class<T>,
    } => {
        if (is_string(root) && is_undefined(id) && is_undefined(class_type)) {
            return {
                _root: document,
                _id: root,
                _class_type: HTMLElement as Class<T>,
            }
        }
        if (is_string(root) && is_function(id) && is_undefined(class_type)) {
            return {
                _root: document,
                _id: root,
                _class_type: id,
            }
        }
        if (is_object(root) && is_string(id) && is_function(class_type)) {
            return {
                _root: root,
                _id: id,
                _class_type: class_type,
            }
        }
        throw new Error('Invalid argument combination');
    })();
    const element = _root.getElementById(_id);
    if (!element) {
        throw new Error("Element not found #" + _id);
    }
    if (!is_of_class_or_html_element<T>(element, _class_type)) {
        throw new Error("Element not of required type HTML Element " + (_class_type?.name ?? 'HTMLElement'));
    }
    return element;
}

/**
 * Do a query selection on a root element expecting a specific type of element.
 * 
 * @param root 
 * @param selector 
 */
export function get_element_by_class_name(root: HasClassSelector, class_name: string): HTMLElement;
export function get_element_by_class_name<T extends HTMLElement>(root: HasClassSelector, class_name: string, class_type: Class<T>): T;
export function get_element_by_class_name<T extends HTMLElement>(
    root: HasClassSelector,
    class_name: string,
    class_type?: Class<T>
): T {
    const element = root.getElementsByClassName(class_name).item(0);
    if (!element) {
        throw new Error("Element not found by class: " + class_name);
    }
    if (!is_of_class_or_html_element<T>(element, class_type)) {
        throw new Error("Element not of required type HTML Element " + (class_type?.name ?? 'HTMLElement'));
    }
    return element;
}

/**
 * Verifies that a en element is a of a specific type and at least an HtmlElement
 * @param element 
 * @param class_type 
 * @returns 
 */
function is_of_class_or_html_element<T extends Element>(element: Element, class_type?: Class<T>): element is T {
    if (class_type) {
        return element instanceof class_type;
    }
    return element instanceof HTMLElement
}

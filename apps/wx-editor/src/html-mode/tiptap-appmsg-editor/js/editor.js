import { Editor, Extension, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Image from "tiptap-extension-image";
import Video from "tiptap-extension-video";
import Iframe from "tiptap-extension-iframe";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import FontSize from "tiptap-extension-font-size";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Link from "tiptap-extension-link";
import CodeBlock from "@tiptap/extension-code-block";
import TrailingNode from "tiptap-extension-trailing-node";
import Section from "tiptap-extension-section";
import ImageLink from "tiptap-extension-image-link";
import Hr from "tiptap-extension-hr";
import BulletList from "tiptap-extension-bullet-list";
import OrderedList from "tiptap-extension-ordered-list";
import LineHeight from "tiptap-extension-line-height";
import Float from "tiptap-extension-float";
import Margin from "tiptap-extension-margin";
import Resizable from "tiptap-extension-resizable";

const PASTE_TO_SECTION_TAGS = new Set([
  "DIV",
  "ARTICLE",
  "MAIN",
  "HEADER",
  "FOOTER",
  "ASIDE",
  "NAV",
  "FIGURE",
  "FIGCAPTION",
]);

const PASTE_STYLE_NODE_TYPES = [
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "codeBlock",
  "horizontalRule",
  "video",
  "iframe",
];

const PASTE_STYLE_MARK_TYPES = [
  "textStyle",
  "link",
  "bold",
  "italic",
  "underline",
  "strike",
  "highlight",
];

const BLOCK_CONTENT_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DIV",
  "DL",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "UL",
]);

function mergeInlineStyles(...styleTexts) {
  if (typeof document === "undefined") {
    return styleTexts
      .filter((styleText) => typeof styleText === "string" && styleText.trim())
      .join("; ");
  }

  const sink = document.createElement("span").style;
  for (const styleText of styleTexts) {
    if (typeof styleText !== "string" || !styleText.trim()) continue;
    const probe = document.createElement("span");
    probe.style.cssText = styleText;

    for (let i = 0; i < probe.style.length; i += 1) {
      const property = probe.style.item(i);
      if (!property) continue;
      sink.setProperty(
        property,
        probe.style.getPropertyValue(property),
        probe.style.getPropertyPriority(property)
      );
    }
  }

  return sink.cssText.trim();
}

function styleAttrConfig() {
  return {
    default: null,
    parseHTML: (element) => element.getAttribute("style"),
    renderHTML: (attributes) =>
      attributes.style ? { style: attributes.style } : {},
  };
}

function classAttrConfig() {
  return {
    default: null,
    parseHTML: (element) => element.getAttribute("class"),
    renderHTML: (attributes) =>
      attributes.class ? { class: attributes.class } : {},
  };
}

function styleTextToMap(styleText) {
  const styleMap = new Map();
  if (!styleText || typeof styleText !== "string") {
    return styleMap;
  }

  styleText
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const [property, ...rest] = item.split(":");
      if (!property || !rest.length) return;
      styleMap.set(property.trim().toLowerCase(), rest.join(":").trim());
    });

  return styleMap;
}

function styleMapToText(styleMap) {
  return Array.from(styleMap.entries())
    .map(([property, value]) => `${property}: ${value}`)
    .join("; ");
}

function isZeroCssValue(value) {
  if (!value || typeof value !== "string") return true;
  return /^0(?:\.0+)?(?:[a-z%]*)?$/i.test(value.trim());
}

function parseCssPair(value, fallback = "0px") {
  if (!value || typeof value !== "string") {
    return [fallback, fallback];
  }

  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return [fallback, fallback];
  }

  if (parts.length === 1) {
    return [parts[0], parts[0]];
  }

  return [parts[0], parts[1]];
}

function parseCssWeight(value) {
  if (!value || typeof value !== "string") return null;
  const nextValue = Number.parseFloat(value);
  if (!Number.isFinite(nextValue) || nextValue <= 0) {
    return null;
  }
  return nextValue;
}

function copyElementAttributes(source, target, excludeAttrNames = []) {
  const excluded = new Set(excludeAttrNames.map((name) => name.toLowerCase()));
  Array.from(source.attributes).forEach((attribute) => {
    if (excluded.has(attribute.name.toLowerCase())) return;
    target.setAttribute(attribute.name, attribute.value);
  });
}

function appendSectionCompatibleChildren(doc, sourceElement, targetElement) {
  const inlineBuffer = [];

  const flushInlineBuffer = () => {
    if (!inlineBuffer.length) return;

    const paragraph = doc.createElement("p");
    inlineBuffer.forEach((node) => {
      paragraph.appendChild(node);
    });
    inlineBuffer.length = 0;
    targetElement.appendChild(paragraph);
  };

  while (sourceElement.firstChild) {
    const childNode = sourceElement.firstChild;
    sourceElement.removeChild(childNode);

    if (childNode.nodeType === 3) {
      if (!childNode.textContent?.trim()) {
        continue;
      }
      inlineBuffer.push(childNode);
      continue;
    }

    if (childNode.nodeType !== 1) {
      continue;
    }

    if (BLOCK_CONTENT_TAGS.has(childNode.tagName)) {
      flushInlineBuffer();
      targetElement.appendChild(childNode);
      continue;
    }

    inlineBuffer.push(childNode);
  }

  flushInlineBuffer();

  if (!targetElement.firstChild) {
    targetElement.appendChild(doc.createElement("p"));
  }
}

function getTableRows(table) {
  const rows = [];
  Array.from(table.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return;

    if (child.tagName === "TR") {
      rows.push(child);
      return;
    }

    if (["TBODY", "THEAD", "TFOOT"].includes(child.tagName)) {
      Array.from(child.children).forEach((row) => {
        if (row instanceof HTMLElement && row.tagName === "TR") {
          rows.push(row);
        }
      });
    }
  });
  return rows;
}

function convertTableToSections(doc, table) {
  const rows = getTableRows(table);
  if (!rows.length) return null;

  const tableSection = doc.createElement("section");
  copyElementAttributes(table, tableSection, [
    "style",
    "width",
    "height",
    "border",
    "cellpadding",
    "cellspacing",
    "align",
    "valign",
  ]);

  const tableStyleMap = styleTextToMap(table.getAttribute("style"));
  const [columnGap, rowGap] = parseCssPair(
    tableStyleMap.get("border-spacing"),
    "0px"
  );
  const originalWidth = tableStyleMap.get("width");

  tableStyleMap.delete("border-collapse");
  tableStyleMap.delete("border-spacing");
  tableStyleMap.delete("table-layout");

  tableStyleMap.set("display", "flex");
  tableStyleMap.set("flex-direction", "column");
  if (isZeroCssValue(rowGap)) {
    tableStyleMap.delete("gap");
  } else {
    tableStyleMap.set("gap", rowGap);
  }

  if (originalWidth) {
    tableStyleMap.set("width", "100%");
    tableStyleMap.set("max-width", originalWidth);
  } else if (!tableStyleMap.has("width")) {
    tableStyleMap.set("width", "100%");
  }

  const nextTableStyle = styleMapToText(tableStyleMap);
  if (nextTableStyle) {
    tableSection.setAttribute("style", nextTableStyle);
  }

  rows.forEach((row) => {
    const cells = Array.from(row.children).filter(
      (cell) =>
        cell instanceof HTMLElement &&
        ["TD", "TH"].includes(cell.tagName)
    );
    if (!cells.length) return;

    const rowSection = doc.createElement("section");
    copyElementAttributes(row, rowSection, [
      "style",
      "width",
      "height",
      "align",
      "valign",
    ]);

    const rowStyleMap = styleTextToMap(row.getAttribute("style"));
    rowStyleMap.set("display", "flex");
    rowStyleMap.set("width", "100%");
    rowStyleMap.set("align-items", "stretch");
    if (isZeroCssValue(columnGap)) {
      rowStyleMap.delete("gap");
    } else {
      rowStyleMap.set("gap", columnGap);
    }

    const nextRowStyle = styleMapToText(rowStyleMap);
    if (nextRowStyle) {
      rowSection.setAttribute("style", nextRowStyle);
    }

    const widthWeights = cells.map((cell) =>
      parseCssWeight(styleTextToMap(cell.getAttribute("style")).get("width"))
    );
    const hasWeightedCells = widthWeights.some((weight) => weight !== null);

    cells.forEach((cell, index) => {
      const cellSection = doc.createElement("section");
      copyElementAttributes(cell, cellSection, [
        "style",
        "width",
        "height",
        "align",
        "valign",
      ]);

      const cellStyleMap = styleTextToMap(cell.getAttribute("style"));
      const widthWeight =
        hasWeightedCells && widthWeights[index] !== null
          ? widthWeights[index]
          : 1;

      cellStyleMap.delete("width");
      cellStyleMap.delete("vertical-align");
      cellStyleMap.set("min-width", "0");
      cellStyleMap.set("flex", `${widthWeight} 1 0%`);

      const nextCellStyle = styleMapToText(cellStyleMap);
      if (nextCellStyle) {
        cellSection.setAttribute("style", nextCellStyle);
      }

      appendSectionCompatibleChildren(doc, cell, cellSection);
      rowSection.appendChild(cellSection);
    });

    tableSection.appendChild(rowSection);
  });

  return tableSection;
}

function normalizePastedHtml(html) {
  if (!html || typeof DOMParser === "undefined") {
    return html;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const { body } = doc;
  if (!body) return html;

  body
    .querySelectorAll("script,style,link,meta,noscript,template")
    .forEach((element) => element.remove());

  Array.from(body.querySelectorAll("table"))
    .reverse()
    .forEach((table) => {
      if (!(table instanceof HTMLElement)) return;
      const replacement = convertTableToSections(doc, table);
      if (!replacement) return;
      table.replaceWith(replacement);
    });

  const elements = Array.from(body.querySelectorAll("*"));
  elements.forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    if (!PASTE_TO_SECTION_TAGS.has(element.tagName)) return;

    const replacement = doc.createElement("section");
    Array.from(element.attributes).forEach((attribute) => {
      replacement.setAttribute(attribute.name, attribute.value);
    });
    while (element.firstChild) {
      replacement.appendChild(element.firstChild);
    }
    element.replaceWith(replacement);
  });

  return body.innerHTML;
}

const PreserveExternalPasteStyle = Extension.create({
  name: "preserveExternalPasteStyle",

  addGlobalAttributes() {
    return [
      {
        types: PASTE_STYLE_NODE_TYPES,
        attributes: {
          style: styleAttrConfig(),
          class: classAttrConfig(),
        },
      },
      {
        types: ["section"],
        attributes: {
          class: classAttrConfig(),
        },
      },
      {
        types: PASTE_STYLE_MARK_TYPES,
        attributes: {
          style: styleAttrConfig(),
          class: classAttrConfig(),
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("wx-preserve-external-paste-style"),
        props: {
          handlePaste: (_view, event) => {
            const html = event?.clipboardData?.getData("text/html");
            if (!html) return false;

            const normalizedHtml = normalizePastedHtml(html);
            if (!normalizedHtml) return false;

            event.preventDefault();
            this.editor.commands.insertContent(normalizedHtml, {
              parseOptions: {
                preserveWhitespace: "full",
              },
            });
            return true;
          },
        },
      }),
    ];
  },
});

const SafeImage = Image.extend({
  renderHTML({ node, HTMLAttributes }) {
    const nextAttributes =
      HTMLAttributes && typeof HTMLAttributes === "object"
        ? { ...HTMLAttributes }
        : {};

    const mergedStyle = mergeInlineStyles(
      node?.attrs?.baseStyle,
      nextAttributes.style
    );
    if (mergedStyle) {
      nextAttributes.style = mergedStyle;
    } else {
      delete nextAttributes.style;
    }

    return ["img", mergeAttributes(this.options.HTMLAttributes, nextAttributes)];
  },
});

const editor = new Editor({
  element: document.querySelector(".editor"),
  extensions: [
    TrailingNode,
    StarterKit.configure({
      bulletList: false,
      orderedList: false,
      codeBlock: false,
    }),
    Underline,
    TextStyle.configure({ mergeNestedSpanStyles: true }),
    Color,
    FontSize,
    TextAlign.configure({ types: ["paragraph"] }),
    Highlight.configure({ multicolor: true }),
    Link.configure({ openOnClick: false, HTMLAttributes: { rel: "" } }),
    CodeBlock.configure({ HTMLAttributes: { class: "code-snippet" } }),
    Resizable.configure({ types: ["image", "video"] }),
    SafeImage.configure({ inline: true, allowBase64: true }),
    Video.configure({ allowBase64: true }),
    Iframe,
    Section,
    ImageLink,
    Hr,
    BulletList.configure({ HTMLAttributes: { class: "list-paddingleft-1" } }),
    OrderedList.configure({ HTMLAttributes: { class: "list-paddingleft-1" } }),
    LineHeight,
    Float,
    Margin,
    PreserveExternalPasteStyle,
  ],
});

export default editor;

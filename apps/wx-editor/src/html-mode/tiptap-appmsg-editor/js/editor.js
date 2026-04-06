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

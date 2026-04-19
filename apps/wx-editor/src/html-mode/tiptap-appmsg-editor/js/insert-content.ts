import editor from "./editor";

interface InsertHtmlModeContentOptions {
  replaceAll?: boolean
}

function normalizeTemplateAlignment(html: string) {
  const container = document.createElement("div");
  container.innerHTML = String(html || "");

  const centeredSections = container.querySelectorAll(
    'section[style*="text-align: center"], section[align="center"], section[align="middle"]'
  );

  centeredSections.forEach((section) => {
    section.querySelectorAll("p[style]").forEach((p) => {
      const styleText = p.getAttribute("style") || "";
      const cleanedStyle = styleText
        .split(";")
        .map(item => item.trim())
        .filter(Boolean)
        .filter(item => !item.toLowerCase().startsWith("text-align"))
        .join("; ");

      if (cleanedStyle) {
        p.setAttribute("style", cleanedStyle);
      }
      else {
        p.removeAttribute("style");
      }
    });
  });

  return container.innerHTML;
}

function insertHtmlModeContent(html: string, options: InsertHtmlModeContentOptions = {}) {
  const normalizedHtml = normalizeTemplateAlignment(html).trim();
  if (!normalizedHtml) {
    return false;
  }

  if (options.replaceAll) {
    editor.commands.clearContent();
  }

  editor
    .chain()
    .focus()
    .insertContent(normalizedHtml, {
      parseOptions: {
        preserveWhitespace: false,
      },
    })
    .run();

  return true;
}

export { insertHtmlModeContent, normalizeTemplateAlignment };

import undo from "../images/svg/undo.svg?raw";
import redo from "../images/svg/redo.svg?raw";
import clearFormat from "../images/svg/clear-format.svg?raw";
import brush from "../images/svg/brush.svg?raw";
import bold from "../images/svg/bold.svg?raw";
import italic from "../images/svg/italic.svg?raw";
import underline from "../images/svg/underline.svg?raw";
import strike from "../images/svg/strike.svg?raw";
import font from "../images/svg/font.svg?raw";
import highlight from "../images/svg/highlight.svg?raw";
import list from "../images/svg/list.svg?raw";
import left from "../images/svg/left.svg?raw";
import center from "../images/svg/center.svg?raw";
import right from "../images/svg/right.svg?raw";
import justify from "../images/svg/justify.svg?raw";
import rowSpacingTop from "../images/svg/rowSpacingTop.svg?raw";
import rowSpacingBottom from "../images/svg/rowSpacingBottom.svg?raw";
import lineHeight from "../images/svg/lineHeight.svg?raw";
import divider from "../images/svg/divider.svg?raw";
import floatLeft from "../images/svg/floatLeft.svg?raw";
import floatRight from "../images/svg/floatRight.svg?raw";
import code from "../images/svg/code.svg?raw";
import emoji from "../images/svg/emoji.svg?raw";

const iconEntries = [
  ["undo", undo],
  ["redo", redo],
  ["clear-format", clearFormat],
  ["brush", brush],
  ["bold", bold],
  ["italic", italic],
  ["underline", underline],
  ["strike", strike],
  ["font", font],
  ["highlight", highlight],
  ["list", list],
  ["left", left],
  ["center", center],
  ["right", right],
  ["justify", justify],
  ["rowSpacingTop", rowSpacingTop],
  ["rowSpacingBottom", rowSpacingBottom],
  ["lineHeight", lineHeight],
  ["divider", divider],
  ["floatLeft", floatLeft],
  ["floatRight", floatRight],
  ["code", code],
  ["emoji", emoji],
];

function toSymbol(id, rawSvg) {
  const viewBox = rawSvg.match(/viewBox\s*=\s*["']([^"']+)["']/i)?.[1];
  const inner = rawSvg
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!doctype[\s\S]*?>/gi, "")
    .replace(/^[\s\S]*?<svg[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "")
    .trim();
  const viewBoxAttr = viewBox ? ` viewBox="${viewBox}"` : "";
  return `<symbol id="${id}"${viewBoxAttr}>${inner}</symbol>`;
}

const symbols = iconEntries.map(([id, rawSvg]) => toSymbol(id, rawSvg)).join("");

document.body.insertAdjacentHTML(
  "beforeend",
  `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">${symbols}</svg>`
);

document.querySelectorAll("use[href]").forEach((useEl) => {
  const href = useEl.getAttribute("href");
  if (href) {
    useEl.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", href);
  }
});


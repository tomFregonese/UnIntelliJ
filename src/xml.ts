/** Small tolerant XML reader for pom.xml and Eclipse .launch files. Pure: no `vscode` import. */

export interface XmlElement {
  name: string;
  attributes: Record<string, string>;
  children: XmlElement[];
  text: string;
}

/** Elements, attributes and text; comments, prolog and doctype are skipped; namespace prefixes dropped. */
export function parseXml(xml: string): XmlElement {
  const root: XmlElement = { name: '#document', attributes: {}, children: [], text: '' };
  const stack: XmlElement[] = [root];
  const pattern = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([\w.:-]+)\s*>|<\s*([\w.:-]+)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (const match of xml.matchAll(pattern)) {
    const current = stack[stack.length - 1];
    if (match[1] !== undefined) {
      current.text += match[1];
    } else if (match[2]) {
      if (stack.length > 1 && current.name === localName(match[2])) {
        stack.pop();
      }
    } else if (match[3]) {
      const attributes: Record<string, string> = {};
      for (const a of (match[4] ?? '').matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        attributes[a[1]] = decodeEntities(a[2] ?? a[3] ?? '');
      }
      const element: XmlElement = { name: localName(match[3]), attributes, children: [], text: '' };
      current.children.push(element);
      if (!match[5]) {
        stack.push(element);
      }
    } else if (match[6]) {
      current.text += decodeEntities(match[6]);
    }
  }
  return root;
}

function localName(name: string): string {
  return name.replace(/^.*:/, '');
}

export function decodeEntities(text: string): string {
  return text.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e: string) => {
    if (e.startsWith('#x')) {
      return String.fromCodePoint(parseInt(e.slice(2), 16));
    }
    if (e.startsWith('#')) {
      return String.fromCodePoint(Number(e.slice(1)));
    }
    return ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" } as Record<string, string>)[e];
  });
}

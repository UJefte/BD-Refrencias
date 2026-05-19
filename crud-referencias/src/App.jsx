import { useState, useEffect, useCallback, useRef } from "react";

const API = "http://localhost:3002/api";
const SESSION_ID = crypto.randomUUID();

// ── MOTORES DE CITA (13 formatos) ────────────────────────────────
const FORMATOS = [
  { id:"APA",      label:"APA 7ª ed.",   grupo:"General" },
  { id:"IEEE",     label:"IEEE",          grupo:"Ingeniería" },
  { id:"ACM",      label:"ACM",           grupo:"Ingeniería" },
  { id:"Harvard",  label:"Harvard",       grupo:"General" },
  { id:"MLA",      label:"MLA 9ª ed.",    grupo:"Humanidades" },
  { id:"Chicago",  label:"Chicago 17ª",   grupo:"Humanidades" },
  { id:"Vancouver",label:"Vancouver",     grupo:"Ciencias" },
  { id:"AMS",      label:"AMS",           grupo:"Matemáticas" },
  { id:"BibTeX",   label:"BibTeX/LaTeX",  grupo:"Técnico" },
  { id:"ABNT",     label:"ABNT",          grupo:"Brasil" },
  { id:"ISO690",   label:"ISO 690",       grupo:"Internacional" },
  { id:"Turabian", label:"Turabian",      grupo:"Humanidades" },
  { id:"Nature",   label:"Nature",        grupo:"Ciencias" },
];

function fmtAutores(raw="", maxN=99) {
  if (!raw) return { lista:[], str:"" };
  const lista = raw.split(";").map(a=>a.trim()).filter(Boolean).slice(0,maxN);
  return { lista, str: raw };
}

// Apellidos para formatos que los requieren
function apellido(nombre) {
  const parts = nombre.trim().split(/[\s,]+/);
  // Si está en formato "Apellido, N." tomar la primera parte
  if (nombre.includes(",")) return nombre.split(",")[0].trim();
  return parts[parts.length-1];
}

function iniciales(nombre) {
  const parts = nombre.trim().split(/[\s,]+/).filter(p=>p.length>1&&!p.includes("."));
  return parts.slice(0,-1).map(p=>p[0].toUpperCase()+".").join(" ");
}

function autorAPA(nombre) {
  // "Gordon Fuller" → "Fuller, G."
  const parts = nombre.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const ape = parts[parts.length-1];
  const ini = parts.slice(0,-1).map(p=>p[0].toUpperCase()+".").join(" ");
  return `${ape}, ${ini}`;
}

function autoresAPA(raw, et_al_n=20) {
  const { lista } = fmtAutores(raw);
  if (!lista.length) return "Autor desconocido";
  if (lista.length > et_al_n) return autorAPA(lista[0]) + " et al.";
  if (lista.length === 1) return autorAPA(lista[0]);
  if (lista.length <= 20) {
    const last = autorAPA(lista[lista.length-1]);
    return lista.slice(0,-1).map(autorAPA).join(", ") + " & " + last;
  }
  return lista.slice(0,19).map(autorAPA).join(", ") + ", ... " + autorAPA(lista[lista.length-1]);
}

function autoresIEEE(raw) {
  const { lista } = fmtAutores(raw);
  if (!lista.length) return "Autor desconocido";
  const fmt = (n) => {
    const parts = n.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    const ape = parts[parts.length-1];
    const ini = parts.slice(0,-1).map(p=>p[0].toUpperCase()+".").join(" ");
    return `${ini} ${ape}`;
  };
  if (lista.length > 6) return fmt(lista[0]) + " et al.";
  return lista.map(fmt).join(", ");
}

function autoresMLA(raw) {
  const { lista } = fmtAutores(raw);
  if (!lista.length) return "Autor desconocido";
  const fmtFirst = (n) => {
    const parts = n.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    const ape = parts[parts.length-1];
    const rest = parts.slice(0,-1).join(" ");
    return `${ape}, ${rest}`;
  };
  if (lista.length === 1) return fmtFirst(lista[0]);
  if (lista.length === 2) return fmtFirst(lista[0]) + ", and " + lista[1];
  return fmtFirst(lista[0]) + ", et al.";
}

function autoresVancouver(raw) {
  const { lista } = fmtAutores(raw);
  if (!lista.length) return "";
  const fmt = (n) => {
    const parts = n.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    const ape = parts[parts.length-1];
    const ini = parts.slice(0,-1).map(p=>p[0].toUpperCase()).join("");
    return `${ape} ${ini}`;
  };
  if (lista.length > 6) return lista.slice(0,6).map(fmt).join(", ") + ", et al.";
  return lista.map(fmt).join(", ");
}

function autoresChicago(raw) {
  const { lista } = fmtAutores(raw);
  if (!lista.length) return "Autor desconocido";
  const fmtFirst = (n) => {
    const parts = n.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    const ape = parts[parts.length-1];
    const rest = parts.slice(0,-1).join(" ");
    return `${ape}, ${rest}`;
  };
  const fmtRest = (n) => n.trim();
  if (lista.length === 1) return fmtFirst(lista[0]);
  if (lista.length === 2) return fmtFirst(lista[0]) + " and " + fmtRest(lista[1]);
  if (lista.length <= 10) {
    return [fmtFirst(lista[0]), ...lista.slice(1,-1).map(fmtRest)].join(", ") + ", and " + fmtRest(lista[lista.length-1]);
  }
  return fmtFirst(lista[0]) + " et al.";
}

function autoresHarvard(raw) {
  const { lista } = fmtAutores(raw);
  if (!lista.length) return "Autor desconocido";
  const fmt = (n) => {
    const parts = n.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    const ape = parts[parts.length-1];
    const ini = parts.slice(0,-1).map(p=>p[0].toUpperCase()+".").join(" ");
    return `${ape}, ${ini}`;
  };
  if (lista.length === 1) return fmt(lista[0]);
  if (lista.length <= 3) return lista.slice(0,-1).map(fmt).join(", ") + " and " + fmt(lista[lista.length-1]);
  return fmt(lista[0]) + " et al.";
}

function bibtexKey(o) {
  const { lista } = fmtAutores(o.autores);
  const ape = lista.length ? apellido(lista[0]).toLowerCase().replace(/[^a-z]/g,'') : "autor";
  const titulo_word = (o.titulo||"").split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g,'');
  return `${ape}${o.anio||""}${titulo_word}`;
}

function bibtexType(tipo) {
  const map = {
    "Libro":"@book","Artículo de revista":"@article","Artículo de conferencia":"@inproceedings",
    "Tesis":"@phdthesis","Sitio web":"@misc","Video":"@misc","Repositorio":"@misc",
    "Preprint":"@misc","Reporte técnico":"@techreport","Artículo web":"@misc",
    "Norma/Estándar":"@techreport",
  };
  return map[tipo] || "@misc";
}

// ── GENERADORES DE CITA ───────────────────────────────────────────
function generarCita(o, formato) {
  const anio   = o.anio    || "s.f.";
  const titulo = o.titulo  || "Sin título";
  const edit   = o.editorial || "";
  const pais   = o.pais    || "";
  const doi    = o.doi     ? `https://doi.org/${o.doi}` : "";
  const url    = o.url     || doi || "";
  const vol    = o.vol     || "";
  const num    = o.num     || "";
  const pags   = o.pags    || "";
  const ed     = o.edicion || "";
  const inst   = o.institucion || "";
  const tipo   = o.tipo    || "Libro";
  const es_libro  = tipo === "Libro";
  const es_art    = tipo.includes("Artículo");
  const es_conf   = tipo.includes("conferencia");
  const es_tesis  = tipo === "Tesis";
  const es_web    = tipo === "Sitio web" || tipo === "Artículo web";
  const es_misc   = !es_libro && !es_art && !es_conf && !es_tesis;

  switch (formato) {
    case "APA": {
      const aut = autoresAPA(o.autores);
      let cita = `${aut} (${anio}). *${titulo}*`;
      if (ed) cita += ` (${ed})`;
      if (es_libro) {
        cita += `. ${edit || inst}`;
      } else if (es_art) {
        cita += `. *${edit}*`;
        if (vol) cita += `, *${vol}*`;
        if (num) cita += `(${num})`;
        if (pags) cita += `, ${pags}`;
      } else if (es_conf) {
        if (edit) cita += `. En *${edit}*`;
        if (pags) cita += ` (pp. ${pags})`;
      } else if (es_web) {
        if (edit || inst) cita += `. ${edit || inst}`;
      } else {
        if (edit) cita += `. ${edit}`;
        if (inst) cita += `, ${inst}`;
      }
      if (url) cita += `. ${url}`;
      return cita;
    }

    case "IEEE": {
      const aut = autoresIEEE(o.autores);
      let cita = `${aut}, "${titulo},"`;
      if (es_libro) {
        if (ed) cita += ` ${ed},`;
        cita += ` ${edit || inst}`;
        if (pais) cita += `, ${pais}`;
        cita += `, ${anio}`;
      } else if (es_art) {
        cita += ` *${edit}*`;
        if (vol) cita += `, vol. ${vol}`;
        if (num) cita += `, no. ${num}`;
        if (pags) cita += `, pp. ${pags}`;
        cita += `, ${anio}`;
        if (url) cita += `. [Online]. Available: ${url}`;
      } else if (es_conf) {
        cita += ` in *${edit}*`;
        if (pags) cita += `, pp. ${pags}`;
        cita += `, ${anio}`;
      } else {
        cita += ` ${edit || inst || ""}, ${anio}`;
        if (url) cita += `. [Online]. Available: ${url}`;
      }
      cita += ".";
      return cita;
    }

    case "ACM": {
      const aut = autoresIEEE(o.autores);
      let cita = `${aut}. ${anio}. ${titulo}.`;
      if (es_libro) {
        if (ed) cita += ` ${ed} ed.`;
        cita += ` ${edit || inst}`;
        if (pais) cita += `, ${pais}`;
      } else if (es_art) {
        cita += ` *${edit}*`;
        if (vol) cita += ` ${vol}`;
        if (num) cita += `, ${num}`;
        if (pags) cita += ` (${anio}), ${pags}`;
      } else if (es_conf) {
        if (edit) cita += ` In *${edit}*`;
        if (pags) cita += `, ${pags}`;
      } else {
        if (edit || inst) cita += ` ${edit || inst}`;
        if (url) cita += ` Retrieved from ${url}`;
      }
      if (o.doi) cita += ` DOI:${o.doi}`;
      return cita;
    }

    case "Harvard": {
      const aut = autoresHarvard(o.autores);
      let cita = `${aut} (${anio}) *${titulo}*`;
      if (ed) cita += `, ${ed} edn`;
      if (es_libro) {
        cita += `. ${pais ? pais + ": " : ""}${edit || inst}`;
      } else if (es_art) {
        cita += `. *${edit}*`;
        if (vol) cita += `, vol. ${vol}`;
        if (num) cita += `, no. ${num}`;
        if (pags) cita += `, pp. ${pags}`;
      } else if (es_conf) {
        if (edit) cita += `. In: *${edit}*`;
        if (pags) cita += `, pp. ${pags}`;
      } else {
        cita += `. ${edit || inst || ""}`;
        if (url) cita += `. Available at: ${url} [Accessed: ${new Date().toLocaleDateString('es-MX')}]`;
      }
      cita += ".";
      return cita;
    }

    case "MLA": {
      const aut = autoresMLA(o.autores);
      let cita = `${aut}. *${titulo}*`;
      if (es_libro) {
        if (ed) cita += `. ${ed} ed.`;
        cita += `. ${edit || inst}`;
        if (pais) cita += `, ${anio}`;
        else cita += `, ${anio}`;
      } else if (es_art) {
        cita += `.  *${edit}*`;
        if (vol) cita += `, vol. ${vol}`;
        if (num) cita += `, no. ${num}`;
        cita += `, ${anio}`;
        if (pags) cita += `, pp. ${pags}`;
      } else if (es_conf) {
        if (edit) cita += `. *${edit}*`;
        if (pags) cita += `, pp. ${pags}`;
        cita += `, ${anio}`;
      } else {
        cita += `. ${edit || inst || ""}`;
        if (anio) cita += `, ${anio}`;
        if (url) cita += `. ${url}`;
      }
      cita += ".";
      return cita;
    }

    case "Chicago": {
      const aut = autoresChicago(o.autores);
      let cita = `${aut}. *${titulo}*.`;
      if (es_libro) {
        if (ed) cita += ` ${ed}.`;
        cita += ` ${pais ? pais + ": " : ""}${edit || inst}`;
        cita += `, ${anio}`;
      } else if (es_art) {
        cita += ` *${edit}*`;
        if (vol) cita += ` ${vol}`;
        if (num) cita += `, no. ${num}`;
        cita += ` (${anio})`;
        if (pags) cita += `: ${pags}`;
        if (o.doi) cita += `. https://doi.org/${o.doi}`;
      } else if (es_conf) {
        if (edit) cita += ` In *${edit}*`;
        if (pags) cita += `, ${pags}`;
        cita += `. ${anio}`;
      } else {
        cita += ` ${edit || inst || ""}`;
        if (anio) cita += `, ${anio}`;
        if (url) cita += `. ${url}`;
      }
      cita += ".";
      return cita;
    }

    case "Vancouver": {
      const aut = autoresVancouver(o.autores);
      let cita = `${aut}. ${titulo}.`;
      if (es_libro) {
        if (ed) cita += ` ${ed} ed.`;
        cita += ` ${pais ? pais + ": " : ""}${edit || inst}`;
        cita += `; ${anio}`;
      } else if (es_art) {
        cita += ` ${edit}.`;
        if (anio) cita += ` ${anio}`;
        if (vol) cita += `;${vol}`;
        if (num) cita += `(${num})`;
        if (pags) cita += `:${pags}`;
      } else if (es_conf) {
        if (edit) cita += ` In: ${edit};`;
        if (pags) cita += ` p. ${pags}`;
        cita += ` ${anio}`;
      } else {
        if (edit || inst) cita += ` ${edit || inst};`;
        cita += ` ${anio}`;
        if (url) cita += `. Disponible en: ${url}`;
      }
      cita += ".";
      return cita;
    }

    case "AMS": {
      const { lista } = fmtAutores(o.autores);
      const aut = lista.map(n => {
        const parts = n.trim().split(/\s+/);
        if (parts.length === 1) return parts[0];
        const ape = parts[parts.length-1];
        const ini = parts.slice(0,-1).map(p=>p[0].toUpperCase()+".").join("\\,");
        return `${ini}\\,${ape}`;
      }).join(" and ");
      let cita = `${aut}, \\textit{${titulo}}`;
      if (es_libro) {
        if (ed) cita += `, ${ed} ed.`;
        cita += `, ${edit || inst}`;
        if (pais) cita += `, ${pais}`;
        cita += `, ${anio}`;
      } else if (es_art) {
        cita += `, ${edit}`;
        if (vol) cita += ` \\textbf{${vol}}`;
        if (anio) cita += ` (${anio})`;
        if (pags) cita += `, ${pags.replace(/-+/g,'--')}`;
      } else {
        cita += `, ${edit || inst || ""}`;
        if (anio) cita += ` (${anio})`;
      }
      if (o.doi) cita += `, \\doi{${o.doi}}`;
      cita += ".";
      return cita;
    }

    case "BibTeX": {
      const { lista } = fmtAutores(o.autores);
      const autBib = lista.map(n => {
        const parts = n.trim().split(/\s+/);
        if (parts.length === 1) return parts[0];
        const ape = parts[parts.length-1];
        const rest = parts.slice(0,-1).join(" ");
        return `${ape}, ${rest}`;
      }).join(" and ");
      const key = bibtexKey(o);
      const btype = bibtexType(tipo);
      let fields = [`  author    = {${autBib || "Autor desconocido"}}`,
                    `  title     = {{${titulo}}}`,
                    `  year      = {${o.anio || ""}}`];
      if (es_libro) {
        if (edit)  fields.push(`  publisher = {${edit}}`);
        if (inst)  fields.push(`  address   = {${inst || pais}}`);
        if (ed)    fields.push(`  edition   = {${ed}}`);
      } else if (es_art) {
        if (edit)  fields.push(`  journal   = {${edit}}`);
        if (vol)   fields.push(`  volume    = {${vol}}`);
        if (num)   fields.push(`  number    = {${num}}`);
        if (pags)  fields.push(`  pages     = {${pags.replace(/-+/g,'--')}}`);
      } else if (es_conf) {
        if (edit)  fields.push(`  booktitle = {${edit}}`);
        if (pags)  fields.push(`  pages     = {${pags.replace(/-+/g,'--')}}`);
      } else {
        if (edit || inst) fields.push(`  howpublished = {${edit || inst}}`);
        if (url)   fields.push(`  url       = {${url}}`);
        fields.push(`  note      = {Accedido: ${new Date().toLocaleDateString('es-MX')}}`);
      }
      if (o.doi)  fields.push(`  doi       = {${o.doi}}`);
      if (url && !es_misc) fields.push(`  url       = {${url}}`);
      return `${btype}{${key},\n${fields.join(",\n")}\n}`;
    }

    case "ABNT": {
      // NBR 6023:2018
      const { lista } = fmtAutores(o.autores);
      const fmtABNT = (n) => {
        const parts = n.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].toUpperCase();
        const ape = parts[parts.length-1].toUpperCase();
        const rest = parts.slice(0,-1).join(" ");
        return `${ape}, ${rest}`;
      };
      const aut = lista.length > 3
        ? fmtABNT(lista[0]) + " et al."
        : lista.map(fmtABNT).join("; ");
      let cita = `${aut}. **${titulo}**`;
      if (ed) cita += `. ${ed}. ed`;
      if (es_libro) {
        cita += `. ${pais ? pais + ": " : ""}${edit || inst}`;
        cita += `, ${anio}`;
      } else if (es_art) {
        cita += `. **${edit}**`;
        if (pais) cita += `, ${pais}`;
        if (vol) cita += `, v. ${vol}`;
        if (num) cita += `, n. ${num}`;
        if (pags) cita += `, p. ${pags}`;
        cita += `, ${anio}`;
      } else {
        cita += `. ${edit || inst || ""}`;
        if (pais) cita += `, ${pais}`;
        cita += `, ${anio}`;
        if (url) cita += `. Disponível em: ${url}`;
        cita += `. Acesso em: ${new Date().toLocaleDateString('pt-BR')}`;
      }
      if (o.doi) cita += `. DOI: ${o.doi}`;
      cita += ".";
      return cita;
    }

    case "ISO690": {
      // ISO 690:2021
      const { lista } = fmtAutores(o.autores);
      const fmtISO = (n) => {
        const parts = n.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].toUpperCase();
        const ape = parts[parts.length-1].toUpperCase();
        const ini = parts.slice(0,-1).map(p=>p[0].toUpperCase()+".").join(" ");
        return `${ape}, ${ini}`;
      };
      const aut = lista.map(fmtISO).join("; ");
      let cita = `${aut}. *${titulo}*`;
      if (ed) cita += `. ${ed} ed.`;
      if (es_libro) {
        cita += `. ${pais ? pais + " : " : ""}${edit || inst}`;
        cita += `, ${anio}`;
      } else if (es_art) {
        cita += `. *${edit}*`;
        if (anio) cita += ` [en línea]. ${anio}`;
        if (vol) cita += `, vol. ${vol}`;
        if (num) cita += `, n.° ${num}`;
        if (pags) cita += `, pp. ${pags}`;
      } else {
        cita += `. ${edit || inst || ""}`;
        if (anio) cita += `, ${anio}`;
        if (url) cita += `. Disponible en: ${url}`;
      }
      if (o.doi) cita += `. DOI: ${o.doi}`;
      cita += ".";
      return cita;
    }

    case "Turabian": {
      // Kate Turabian, Notes-Bibliography
      const aut = autoresChicago(o.autores);
      let cita = `${aut}. *${titulo}*.`;
      if (es_libro) {
        if (ed) cita += ` ${ed}.`;
        cita += ` ${pais ? pais + ": " : ""}${edit || inst}`;
        cita += `, ${anio}`;
      } else if (es_art) {
        cita += ` "${edit}"`;
        if (vol) cita += ` ${vol}`;
        if (num) cita += `, no. ${num}`;
        cita += ` (${anio})`;
        if (pags) cita += `: ${pags}`;
      } else if (es_conf) {
        if (edit) cita += ` Paper presented at *${edit}*`;
        cita += `, ${anio}`;
      } else {
        if (edit || inst) cita += ` ${edit || inst}`;
        cita += `, ${anio}`;
        if (url) cita += `. ${url}`;
      }
      cita += ".";
      return cita;
    }

    case "Nature": {
      // Nature journal style
      const { lista } = fmtAutores(o.autores);
      const fmtNat = (n) => {
        const parts = n.trim().split(/\s+/);
        if (parts.length === 1) return parts[0];
        const ape = parts[parts.length-1];
        const ini = parts.slice(0,-1).map(p=>p[0].toUpperCase()+".").join(" ");
        return `${ini} ${ape}`;
      };
      const aut = lista.length > 6
        ? lista.slice(0,5).map(fmtNat).join(", ") + " et al."
        : lista.map(fmtNat).join(", ");
      let cita = `${aut}. ${titulo}.`;
      if (es_libro) {
        cita += ` (${edit || inst}`;
        if (pais) cita += `, ${pais}`;
        cita += `, ${anio})`;
      } else if (es_art) {
        cita += ` *${edit}*`;
        if (vol) cita += ` **${vol}**`;
        if (pags) cita += `, ${pags}`;
        cita += ` (${anio})`;
      } else {
        if (edit) cita += ` ${edit}`;
        cita += ` (${anio})`;
        if (url) cita += `. Preprint at ${url}`;
      }
      if (o.doi) cita += `. https://doi.org/${o.doi}`;
      return cita;
    }

    default: return "Formato no reconocido";
  }
}

// ── ESTILOS ───────────────────────────────────────────────────────
const C = {
  bg:     "#f8f9fb",
  white:  "#ffffff",
  dark:   "#1a1a2e",
  accent: "#2D6A4F",   // verde oscuro — diferente de inscripciones
  accentL:"#d8f3dc",
  amber:  "#e76f51",
  amberL: "#fde8e4",
  gray:   "#6b7280",
  grayL:  "#f3f4f6",
  border: "#e5e7eb",
  text:   "#374151",
};

const monofont = "'Fira Code','Consolas','Courier New',monospace";

// ── MINI COMPONENTS ───────────────────────────────────────────────
function Badge({ color=C.accent, bg=C.accentL, children }) {
  return <span style={{ display:"inline-block", padding:"2px 8px", borderRadius:12,
    fontSize:11, fontWeight:600, color, background:bg, whiteSpace:"nowrap" }}>{children}</span>;
}

function Spinner() {
  return <div style={{ textAlign:"center", padding:40, color:C.gray }}>Cargando…</div>;
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} style={{ padding:"5px 14px", background: copied?C.accentL:C.grayL,
      border:`1px solid ${copied?C.accent:C.border}`, borderRadius:6, cursor:"pointer",
      fontSize:12, color: copied?C.accent:C.gray, fontWeight:600, transition:"all .2s" }}>
      {copied ? "✓ Copiado" : "Copiar"}
    </button>
  );
}

// ── TARJETA DE OBRA ───────────────────────────────────────────────
function ObraCard({ obra, onSelect, selected }) {
  return (
    <div onClick={() => onSelect(obra)}
      style={{ background:C.white, border:`1.5px solid ${selected?C.accent:C.border}`,
        borderRadius:10, padding:"14px 16px", marginBottom:10, cursor:"pointer",
        boxShadow: selected?"0 0 0 3px "+C.accentL:"none", transition:"all .15s" }}>
      <div style={{ fontWeight:600, color:C.dark, fontSize:14, marginBottom:4 }}>{obra.titulo}</div>
      <div style={{ fontSize:12, color:C.gray, marginBottom:6 }}>
        {obra.autores || "Autor desconocido"} · {obra.anio || "s.f."}
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
        <Badge>{obra.tipo}</Badge>
        {obra.area && <Badge color={C.amber} bg={C.amberL}>{obra.area}</Badge>}
        {obra.materia && <Badge color="#6b21a8" bg="#f3e8ff">{obra.materia}</Badge>}
      </div>
    </div>
  );
}

// ── PANEL DE CITA ─────────────────────────────────────────────────
function CitaPanel({ obra, onGuardar }) {
  const [fmt, setFmt] = useState("APA");
  const cita = generarCita(obra, fmt);
  const isBib = fmt === "BibTeX" || fmt === "AMS";

  return (
    <div>
      {/* Selector de formatos */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:12, fontWeight:600, color:C.gray, marginBottom:8,
          textTransform:"uppercase", letterSpacing:.5 }}>Formato de cita</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {FORMATOS.map(f => (
            <button key={f.id} onClick={() => setFmt(f.id)}
              style={{ padding:"5px 12px", borderRadius:20, border:`1.5px solid ${fmt===f.id?C.accent:C.border}`,
                background: fmt===f.id?C.accent:C.white, color:fmt===f.id?"#fff":C.gray,
                fontSize:12, fontWeight:600, cursor:"pointer", transition:"all .15s" }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cita generada */}
      <div style={{ background:C.grayL, borderRadius:8, padding:16, marginBottom:12,
        border:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
          <span style={{ fontSize:12, fontWeight:700, color:C.accent }}>
            {FORMATOS.find(f=>f.id===fmt)?.label} — {obra.tipo}
          </span>
          <CopyBtn text={cita}/>
        </div>
        <div style={{ fontFamily: isBib?monofont:"inherit", fontSize:isBib?12:13,
          color:C.dark, lineHeight:1.7, whiteSpace:isBib?"pre":"normal",
          wordBreak:"break-word" }}
          dangerouslySetInnerHTML={{ __html: cita
            .replace(/\*([^*]+)\*/g,'<em>$1</em>')
            .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>') }}
        />
      </div>

      {/* Todos los formatos de un vistazo */}
      <details style={{ marginBottom:12 }}>
        <summary style={{ fontSize:12, color:C.accent, cursor:"pointer", fontWeight:600 }}>
          Ver todos los formatos generados
        </summary>
        <div style={{ marginTop:10 }}>
          {FORMATOS.map(f => {
            const c = generarCita(obra, f.id);
            return (
              <div key={f.id} style={{ marginBottom:10, padding:"10px 14px",
                background:C.white, border:`1px solid ${C.border}`, borderRadius:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:C.accent }}>{f.label}</span>
                  <CopyBtn text={c}/>
                </div>
                <div style={{ fontFamily:f.id==="BibTeX"||f.id==="AMS"?monofont:"inherit",
                  fontSize:11, color:C.text, lineHeight:1.6,
                  whiteSpace:f.id==="BibTeX"||f.id==="AMS"?"pre":"normal",
                  wordBreak:"break-word" }}
                  dangerouslySetInnerHTML={{ __html: c
                    .replace(/\*([^*]+)\*/g,'<em>$1</em>')
                    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>') }}
                />
              </div>
            );
          })}
        </div>
      </details>

      <button onClick={() => onGuardar(obra, fmt, cita)}
        style={{ width:"100%", padding:"9px", background:C.accent, color:"#fff",
          border:"none", borderRadius:8, fontWeight:600, fontSize:13, cursor:"pointer" }}>
        + Guardar en historial
      </button>
    </div>
  );
}

function NuevaObraModal({ onClose, materias, areas, tipos, onGuardada }) {
  const [form, setForm] = useState({
    titulo:"", autores_raw:"", anio:"", editorial:"", vol:"", num:"",
    pags:"", edicion:"", pais:"", institucion:"", url:"", doi:"",
    id_tipo:1, fecha_acceso:"", id_area:"", id_materia:""
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");

  const upd = k => e => setForm(f=>({...f,[k]:e.target.value}));

  const tipoNombre  = tipos.find(t=>t.id_tipo===Number(form.id_tipo))?.nombre || "Libro";
  const camposExtra = CAMPOS_POR_TIPO[tipoNombre] || CAMPOS_POR_TIPO["Libro"];
  const esWeb   = ["Sitio web","Artículo web","Video","Repositorio"].includes(tipoNombre);
  const esTesis = tipoNombre === "Tesis";

  // Filtrar materias por área seleccionada
  const materiasFiltradas = form.id_area
    ? materias.filter(m => String(m.id_area) === String(form.id_area))
    : materias;

  const guardar = async () => {
    if (!form.titulo.trim()) { setErr("El título es requerido"); return; }
    if (esWeb && !form.url.trim()) { setErr("La URL es requerida para este tipo"); return; }
    setLoading(true); setErr("");
    const autores = form.autores_raw.split(";").map(a=>a.trim()).filter(Boolean);
    const notas = esWeb && form.fecha_acceso ? `Consultado: ${form.fecha_acceso}` : undefined;
    const id_materias = form.id_materia ? [Number(form.id_materia)] : [];
    try {
      const r = await fetch(`${API}/obras`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ ...form, autores, id_tipo:Number(form.id_tipo), notas, id_materias })
      }).then(r=>r.json());
      if (!r.ok) { setErr(r.msg); } else { onGuardada(r.id_obra); onClose(); }
    } catch { setErr("Error de conexión"); }
    setLoading(false);
  };

  const inp = (extra={}) => ({
    width:"100%", padding:"8px 10px", border:`1px solid ${C.border}`,
    borderRadius:6, fontSize:13, color:C.dark, outline:"none",
    background:C.white, ...extra
  });
  const lbl = { fontSize:12, color:C.gray, display:"block", marginBottom:4, fontWeight:500 };
  const req = { fontSize:10, color:C.accent, marginLeft:4 };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:C.white, borderRadius:12, padding:28, width:640,
        maxHeight:"92vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,.2)" }}>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
          <div style={{ fontWeight:700, fontSize:17, color:C.dark }}>Nueva referencia</div>
          <button onClick={onClose} style={{ background:"none", border:"none",
            fontSize:22, color:C.gray, cursor:"pointer" }}>×</button>
        </div>
        <div style={{ fontSize:12, color:C.gray, marginBottom:20 }}>
          Los campos marcados con <span style={{ color:C.accent, fontWeight:700 }}>*</span> son obligatorios
        </div>

        {err && <div style={{ background:"#fef2f2", border:"1px solid #fca5a5",
          borderRadius:6, padding:"8px 12px", color:"#dc2626", fontSize:13, marginBottom:12 }}>{err}</div>}

        {/* Tipo */}
        <div style={{ background:C.accentL, borderRadius:8, padding:"12px 14px", marginBottom:16 }}>
          <label style={{ ...lbl, color:C.accent, fontWeight:700 }}>
            Tipo de referencia <span style={req}>*</span>
          </label>
          <select style={inp({ background:"#fff", fontWeight:600 })}
            value={form.id_tipo} onChange={upd("id_tipo")}>
            {tipos.map(t=><option key={t.id_tipo} value={t.id_tipo}>{t.nombre}</option>)}
          </select>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>

          {/* Título */}
          <div style={{ gridColumn:"span 2" }}>
            <label style={lbl}>Título <span style={req}>*</span></label>
            <input style={inp()} value={form.titulo} onChange={upd("titulo")}
              placeholder="Título completo de la obra"/>
          </div>

          {/* Autores */}
          <div style={{ gridColumn:"span 2" }}>
            <label style={lbl}>
              {esWeb ? "Autor / Organización" : "Autores"}
              <span style={{ fontSize:11, color:C.gray, marginLeft:6, fontWeight:400 }}>
                {esWeb ? "(si aplica)" : "— separar con punto y coma (;)"}
              </span>
            </label>
            <input style={inp()} value={form.autores_raw} onChange={upd("autores_raw")}
              placeholder={esWeb ? "Ej: García Juan  o  Secretaría de Educación Pública"
                : "Ej: García López Juan; Martínez Ana"}/>
          </div>

          {/* Área */}
          <div>
            <label style={lbl}>Área de estudio <span style={req}>*</span></label>
            <select style={inp()} value={form.id_area}
              onChange={e => setForm(f=>({...f, id_area:e.target.value, id_materia:""}))}>
              <option value="">— Seleccionar área —</option>
              {areas.map(a=><option key={a.id_area} value={a.id_area}>{a.nombre}</option>)}
            </select>
          </div>

          {/* Materia */}
          <div>
            <label style={lbl}>Materia <span style={req}>*</span></label>
            <select style={inp()} value={form.id_materia} onChange={upd("id_materia")}
              disabled={!form.id_area}>
              <option value="">— Seleccionar materia —</option>
              {materiasFiltradas.map(m=><option key={m.id_materia} value={m.id_materia}>{m.nombre}</option>)}
            </select>
          </div>

          {/* Año */}
          {!camposExtra.anio && (
            <div>
              <label style={lbl}>Año de publicación</label>
              <input style={inp()} type="number" value={form.anio} onChange={upd("anio")}
                placeholder={new Date().getFullYear().toString()} min={1000} max={2099}/>
            </div>
          )}

          {/* Campos dinámicos */}
          {Object.entries(camposExtra).map(([k, cfg]) => {
            const span2 = ["url","doi","institucion"].includes(k);
            return (
              <div key={k} style={{ gridColumn:span2?"span 2":undefined }}>
                <label style={lbl}>{cfg.label}
                  {cfg.label.includes("*") && <span style={req}>*</span>}
                </label>
                <input style={inp()} value={form[k]||""} onChange={upd(k)} placeholder={cfg.ph||""}/>
              </div>
            );
          })}

          {/* Fecha de acceso para web */}
          {esWeb && (
            <div>
              <label style={lbl}>Fecha de acceso <span style={{ color:C.gray, fontWeight:400, fontSize:11 }}>(para la cita)</span></label>
              <input style={inp()} type="date" value={form.fecha_acceso} onChange={upd("fecha_acceso")}/>
            </div>
          )}

          {/* Tipo de tesis */}
          {esTesis && (
            <div>
              <label style={lbl}>Tipo de tesis</label>
              <select style={inp()} value={form.edicion} onChange={upd("edicion")}>
                <option value="">Seleccionar</option>
                <option>Tesis de licenciatura</option>
                <option>Tesis de maestría</option>
                <option>Tesis doctoral</option>
              </select>
            </div>
          )}
        </div>

        <div style={{ marginTop:16, background:C.grayL, borderRadius:8,
          padding:"10px 14px", fontSize:11, color:C.gray }}>
          <span style={{ fontWeight:600 }}>Formatos disponibles: </span>
          APA · IEEE · Harvard · ACM · MLA · Chicago · Vancouver · AMS · BibTeX · ABNT · ISO 690 · Turabian · Nature
        </div>

        <div style={{ marginTop:16, display:"flex", justifyContent:"flex-end", gap:8 }}>
          <button onClick={onClose} style={{ padding:"8px 18px", background:"none",
            border:`1px solid ${C.border}`, borderRadius:6, cursor:"pointer", color:C.gray }}>
            Cancelar
          </button>
          <button onClick={guardar} disabled={loading}
            style={{ padding:"8px 18px", background:C.accent, color:"#fff",
              border:"none", borderRadius:6, cursor:"pointer", fontWeight:600,
              opacity:loading?0.6:1 }}>
            {loading ? "Guardando…" : "Guardar referencia"}
          </button>
        </div>
      </div>
    </div>
  );
}
const CAMPOS_POR_TIPO = {
  "Libro":                  { editorial:{label:"Editorial",ph:"Pearson"}, pais:{label:"País",ph:"México"}, edicion:{label:"Edición",ph:"3a ed."}, doi:{label:"DOI",ph:"10.xxxx/xxxxx"} },
  "Artículo de revista":    { editorial:{label:"Nombre de la revista",ph:"Journal of ACM"}, vol:{label:"Volumen",ph:"12"}, num:{label:"Número",ph:"3"}, pags:{label:"Páginas",ph:"45-67"}, doi:{label:"DOI",ph:"10.xxxx/xxxxx"}, url:{label:"URL",ph:"https://..."} },
  "Artículo de conferencia":{ editorial:{label:"Nombre del evento/congreso",ph:"IEEE CVPR 2023"}, pais:{label:"País",ph:"México"}, pags:{label:"Páginas",ph:"45-67"}, url:{label:"URL",ph:"https://..."} },
  "Tesis":                  { institucion:{label:"Universidad/Institución",ph:"UNAM FES Aragón"}, pais:{label:"País",ph:"México"}, url:{label:"URL repositorio",ph:"https://..."} },
  "Sitio web":              { editorial:{label:"Organización/Sitio",ph:"Wikipedia, UNAM, etc."}, url:{label:"URL *",ph:"https://..."},  },
  "Artículo web":           { editorial:{label:"Sitio web/Portal",ph:"Medium, Dev.to, etc."}, url:{label:"URL *",ph:"https://..."} },
  "Video":                  { editorial:{label:"Canal/Plataforma",ph:"YouTube – MIT OpenCourseWare"}, url:{label:"URL del video *",ph:"https://youtube.com/..."} },
  "Repositorio":            { editorial:{label:"Plataforma",ph:"GitHub, GitLab"}, url:{label:"URL del repositorio *",ph:"https://github.com/..."}, institucion:{label:"Organización",ph:"Google, UNAM"} },
  "Preprint":               { editorial:{label:"Repositorio",ph:"arXiv, bioRxiv, SSRN"}, url:{label:"URL/DOI *",ph:"https://arxiv.org/..."}, doi:{label:"DOI",ph:"10.xxxx/xxxxx"} },
  "Reporte técnico":        { editorial:{label:"Editorial/Organización",ph:"IEEE, RFC, NIST"}, institucion:{label:"Institución emisora",ph:"UNAM, MIT"}, pais:{label:"País",ph:"USA"}, num:{label:"Número de reporte",ph:"RFC 2616"}, url:{label:"URL",ph:"https://..."} },
  "Norma/Estándar":         { editorial:{label:"Organismo normativo",ph:"ISO, IEEE, ANSI"}, num:{label:"Número de norma",ph:"ISO 9001:2015"}, anio:{label:"Año de publicación",ph:"2023"}, url:{label:"URL",ph:"https://..."} },
};

// ── MODAL NUEVA OBRA ──────────────────────────────────────────────
// ── HISTORIAL ─────────────────────────────────────────────────────
function Historial({ items, onEliminar, onCerrar }) {
  if (!items.length) return (
    <div style={{ textAlign:"center", padding:40, color:C.gray }}>
      <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
      <div>No hay referencias en el historial de esta sesión.</div>
    </div>
  );
  return (
    <div>
      <div style={{ fontSize:13, color:C.gray, marginBottom:16 }}>
        {items.length} referencia{items.length!==1?"s":""} generada{items.length!==1?"s":""}
      </div>
      {items.map(h => (
        <div key={h.id_historial} style={{ background:C.white, border:`1px solid ${C.border}`,
          borderRadius:8, padding:"12px 16px", marginBottom:8 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
            <div>
              <Badge>{h.formato}</Badge>
              <span style={{ fontSize:12, color:C.gray, marginLeft:8 }}>{h.titulo}</span>
            </div>
            <button onClick={() => onEliminar(h.id_historial)}
              style={{ background:"none", border:"none", color:C.gray, cursor:"pointer", fontSize:16 }}>×</button>
          </div>
          <div style={{ fontSize:12, color:C.text, lineHeight:1.6, wordBreak:"break-word",
            fontFamily:h.formato==="BibTeX"||h.formato==="AMS"?monofont:"inherit",
            whiteSpace:h.formato==="BibTeX"||h.formato==="AMS"?"pre":"normal" }}>
            {h.cita_generada}
          </div>
          <div style={{ marginTop:6 }}>
            <CopyBtn text={h.cita_generada}/>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── APP ROOT ──────────────────────────────────────────────────────
export default function App() {
  const [tab,       setTab]       = useState("buscar");
  const [areas,     setAreas]     = useState([]);
  const [materias,  setMaterias]  = useState([]);
  const [tipos,     setTipos]     = useState([]);
  const [obras,     setObras]     = useState([]);
  const [total,     setTotal]     = useState(0);
  const [obraSelec, setObraSelec] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [recientes, setRecientes] = useState([]); // solo agregadas en esta sesión
  const [loading,   setLoading]   = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [filters,   setFilters]   = useState({ q:"", area:"", materia:"", tipo:"", offset:0 });
  const LIMIT = 15;

  const cargarRecientes = useCallback(() => {}, []); // no-op, recientes se manejan localmente

  // Cargar catálogos
  useEffect(() => {
    Promise.all([
      fetch(`${API}/areas`).then(r=>r.json()),
      fetch(`${API}/materias`).then(r=>r.json()),
      fetch(`${API}/tipos`).then(r=>r.json()),
      fetch(`${API}/historial?sesion_id=${SESSION_ID}`).then(r=>r.json()),
    ]).then(([a,m,t,h]) => {
      if(a.ok) setAreas(a.areas);
      if(m.ok) setMaterias(m.materias);
      if(t.ok) setTipos(t.tipos);
      if(h.ok) setHistorial(h.historial);
    }).catch(console.error);
    cargarRecientes();
  }, []);

  // Buscar
  const buscar = useCallback(async (f = filters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit:LIMIT, ...f });
      const r = await fetch(`${API}/obras?${params}`).then(r=>r.json());
      if (r.ok) { setObras(r.obras); setTotal(r.total); }
    } catch { }
    setLoading(false);
  }, [filters]);

  useEffect(() => { buscar(); }, []);

  const setFilter = (k, v) => {
    const nf = { ...filters, [k]: v, offset: 0 };
    setFilters(nf);
    buscar(nf);
  };

  const guardarHistorial = async (obra, formato, cita) => {
    await fetch(`${API}/historial`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ id_obra:obra.id_obra, formato, cita_generada:cita, sesion_id:SESSION_ID })
    });
    const r = await fetch(`${API}/historial?sesion_id=${SESSION_ID}`).then(r=>r.json());
    if (r.ok) setHistorial(r.historial);
  };

  const eliminarHistorial = async (id) => {
    await fetch(`${API}/historial/${id}`, { method:"DELETE" });
    setHistorial(h => h.filter(x => x.id_historial !== id));
  };

  const materiasFiltradas = filters.area
    ? materias.filter(m => String(m.id_area) === String(filters.area))
    : materias;

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",
      fontSize:14, color:C.dark }}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0} input,select,button,textarea{font-family:inherit;font-size:14px}`}</style>

      {/* HEADER */}
      <header style={{ background:C.dark, padding:"0 32px", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex",
          justifyContent:"space-between", alignItems:"center", height:56 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:28, height:28, background:C.accent, borderRadius:6,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:16, fontWeight:800, color:"#fff" }}>R</div>
            <div>
              <span style={{ fontSize:16, fontWeight:700, color:"#fff" }}>Referencias ICO</span>
              <span style={{ fontSize:11, color:"#94a3b8", marginLeft:8 }}>FES Aragón · UNAM</span>
            </div>
          </div>
          <div style={{ display:"flex", gap:4 }}>
            {[["buscar","🔍 Buscar"],["recientes","🕐 Recientes"],["historial",`📋 Historial (${historial.length})`],["agregar","+ Agregar"]].map(([id,label])=>(
              <button key={id} onClick={() => id==="agregar"?setShowModal(true):setTab(id)}
                style={{ padding:"6px 14px", borderRadius:6, border:"none", cursor:"pointer",
                  background:tab===id&&id!=="agregar"?"rgba(255,255,255,.15)":"transparent",
                  color:tab===id&&id!=="agregar"?"#fff":"#94a3b8", fontSize:13, fontWeight:500 }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div style={{ width:"100%", padding:"24px 32px" }}>

        {/* ── TAB BUSCAR */}
        {tab === "buscar" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 500px", gap:24, alignItems:"start" }}>

            {/* Panel izquierdo: búsqueda */}
            <div>
              {/* Barra de búsqueda */}
              <div style={{ background:C.white, borderRadius:12, padding:"16px 20px",
                border:`1px solid ${C.border}`, marginBottom:16 }}>
                <div style={{ position:"relative", marginBottom:12 }}>
                  <span style={{ position:"absolute", left:12, top:10, color:C.gray, fontSize:16 }}>🔍</span>
                  <input style={{ width:"100%", padding:"9px 12px 9px 36px",
                    border:`1.5px solid ${C.border}`, borderRadius:8, fontSize:14,
                    color:C.dark, outline:"none", background:C.bg }}
                    value={filters.q}
                    onChange={e => setFilter("q", e.target.value)}
                    placeholder="Buscar por título o autor…"
                    onKeyDown={e => e.key==="Enter" && buscar()}
                  />
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                  <div>
                    <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4, fontWeight:600 }}>Área</label>
                    <select style={{ width:"100%", padding:"7px 10px", border:`1px solid ${C.border}`,
                      borderRadius:6, color:C.dark, fontSize:13, background:C.white, outline:"none" }}
                      value={filters.area} onChange={e => setFilter("area", e.target.value)}>
                      <option value="">Todas las áreas</option>
                      {areas.map(a => <option key={a.id_area} value={a.id_area}>{a.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4, fontWeight:600 }}>Materia</label>
                    <select style={{ width:"100%", padding:"7px 10px", border:`1px solid ${C.border}`,
                      borderRadius:6, color:C.dark, fontSize:13, background:C.white, outline:"none" }}
                      value={filters.materia} onChange={e => setFilter("materia", e.target.value)}>
                      <option value="">Todas las materias</option>
                      {materiasFiltradas.map(m => <option key={m.id_materia} value={m.id_materia}>{m.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4, fontWeight:600 }}>Tipo</label>
                    <select style={{ width:"100%", padding:"7px 10px", border:`1px solid ${C.border}`,
                      borderRadius:6, color:C.dark, fontSize:13, background:C.white, outline:"none" }}
                      value={filters.tipo} onChange={e => setFilter("tipo", e.target.value)}>
                      <option value="">Todos los tipos</option>
                      {tipos.map(t => <option key={t.id_tipo} value={t.id_tipo}>{t.nombre}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Resultados */}
              <div style={{ fontSize:12, color:C.gray, marginBottom:10 }}>
                {loading ? "Buscando…" : `${total} resultado${total!==1?"s":""} encontrado${total!==1?"s":""}`}
              </div>

              {loading ? <Spinner/> : obras.map(o => (
                <ObraCard key={o.id_obra} obra={o}
                  selected={obraSelec?.id_obra === o.id_obra}
                  onSelect={setObraSelec}/>
              ))}

              {/* Paginación */}
              {total > LIMIT && (
                <div style={{ display:"flex", justifyContent:"center", gap:8, marginTop:16 }}>
                  <button disabled={filters.offset===0}
                    onClick={() => { const nf={...filters,offset:filters.offset-LIMIT}; setFilters(nf); buscar(nf); }}
                    style={{ padding:"6px 16px", border:`1px solid ${C.border}`, borderRadius:6,
                      cursor:"pointer", background:C.white, color:C.gray, opacity:filters.offset===0?.4:1 }}>
                    ← Anterior
                  </button>
                  <span style={{ padding:"6px 12px", color:C.gray, fontSize:13 }}>
                    {Math.floor(filters.offset/LIMIT)+1} / {Math.ceil(total/LIMIT)}
                  </span>
                  <button disabled={filters.offset+LIMIT>=total}
                    onClick={() => { const nf={...filters,offset:filters.offset+LIMIT}; setFilters(nf); buscar(nf); }}
                    style={{ padding:"6px 16px", border:`1px solid ${C.border}`, borderRadius:6,
                      cursor:"pointer", background:C.white, color:C.gray,
                      opacity:filters.offset+LIMIT>=total?.4:1 }}>
                    Siguiente →
                  </button>
                </div>
              )}
            </div>

            {/* Panel derecho: generador de cita */}
            <div style={{ position:"sticky", top:80 }}>
              {obraSelec ? (
                <div style={{ background:C.white, borderRadius:12, padding:20,
                  border:`1px solid ${C.border}` }}>
                  <div style={{ fontWeight:700, fontSize:15, color:C.dark, marginBottom:4 }}>
                    {obraSelec.titulo}
                  </div>
                  <div style={{ fontSize:12, color:C.gray, marginBottom:16 }}>
                    {obraSelec.autores || "Autor desconocido"} · {obraSelec.anio || "s.f."}
                  </div>
                  <CitaPanel obra={obraSelec} onGuardar={guardarHistorial}/>
                </div>
              ) : (
                <div style={{ background:C.white, borderRadius:12, padding:40,
                  border:`1px solid ${C.border}`, textAlign:"center", color:C.gray }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>📖</div>
                  <div style={{ fontWeight:600, marginBottom:6 }}>Selecciona una referencia</div>
                  <div style={{ fontSize:12 }}>Haz clic en cualquier resultado para generar su cita en 13 formatos</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB HISTORIAL DE CITAS */}
        {tab === "historial" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <div style={{ fontSize:20, fontWeight:700 }}>Historial de citas</div>
              {historial.length > 0 && (
                <button onClick={() => {
                    const todo = historial.map(h=>h.cita_generada).join("\n\n");
                    navigator.clipboard.writeText(todo);
                  }}
                  style={{ padding:"6px 14px", background:C.white, border:`1px solid ${C.border}`,
                    borderRadius:6, cursor:"pointer", color:C.gray, fontSize:13 }}>
                  Copiar todo
                </button>
              )}
            </div>
            <Historial items={historial} onEliminar={eliminarHistorial} onCerrar={()=>setTab("buscar")}/>
          </div>
        )}

        {/* ── TAB RECIENTES */}
        {tab === "recientes" && (
          <div style={{ maxWidth:900 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <div>
                <div style={{ fontSize:20, fontWeight:700 }}>Referencias agregadas recientemente</div>
                <div style={{ fontSize:12, color:C.gray, marginTop:4 }}>
                  Las últimas referencias registradas en la base de datos
                </div>
              </div>
              <button onClick={() => setShowModal(true)}
                style={{ padding:"8px 16px", background:C.accent, color:"#fff",
                  border:"none", borderRadius:8, cursor:"pointer", fontWeight:600, fontSize:13 }}>
                + Agregar nueva
              </button>
            </div>
            {recientes.length === 0
              ? <div style={{ textAlign:"center", padding:60, color:C.gray }}>
                  <div style={{ fontSize:36, marginBottom:12 }}>📝</div>
                  <div style={{ fontWeight:600 }}>No hay referencias recientes</div>
                  <div style={{ fontSize:12, marginTop:6 }}>Agrega una nueva referencia con el botón de arriba</div>
                </div>
              : <div style={{ display:"grid", gap:10 }}>
                  {recientes.map(o => (
                    <div key={o.id_obra}
                      style={{ background:C.white, border:`1px solid ${C.border}`,
                        borderRadius:10, padding:"14px 18px",
                        display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600, color:C.dark, marginBottom:4 }}>{o.titulo}</div>
                        <div style={{ fontSize:12, color:C.gray, marginBottom:8 }}>
                          {o.autores || "Autor desconocido"} · {o.anio || "s.f."}
                        </div>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          <Badge>{o.tipo}</Badge>
                          {o.area && <Badge color={C.amber} bg={C.amberL}>{o.area}</Badge>}
                          {o.materia && <Badge color="#6b21a8" bg="#f3e8ff">{o.materia}</Badge>}
                        </div>
                      </div>
                      <button onClick={() => { setObraSelec(o); setTab("buscar"); }}
                        style={{ marginLeft:16, padding:"6px 14px", background:C.accentL,
                          color:C.accent, border:`1px solid ${C.accent}33`, borderRadius:6,
                          cursor:"pointer", fontSize:12, fontWeight:600, whiteSpace:"nowrap" }}>
                        Citar →
                      </button>
                    </div>
                  ))}
                </div>
            }
          </div>
        )}
      </div>

      {showModal && (
        <NuevaObraModal
          tipos={tipos}
          materias={materias}
          areas={areas}
          onClose={() => setShowModal(false)}
          onGuardada={async (id_obra) => {
            buscar();
            // Cargar la obra recién agregada por su ID
            try {
              const r = await fetch(`${API}/obras/${id_obra}`).then(r=>r.json());
              if (r.ok && r.obra) {
                setRecientes(prev => [r.obra, ...prev].slice(0, 20));
              }
            } catch {}
          }}
        />
      )}
    </div>
  );
}
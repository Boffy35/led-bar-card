/*
 * LED Bar Card – a 20-segment LED meter for Home Assistant
 * Gradient runs red (min) → green (max), with a visual (UI) editor.
 *
 * Install:
 *   1. Copy this file to /config/www/led-bar-card.js
 *   2. Settings → Dashboards → ⋮ → Resources → Add resource
 *        URL:  /local/led-bar-card.js?v=1
 *        Type: JavaScript module
 *   3. Hard-refresh the browser, then add "LED Bar Card" from the card picker.
 *
 * YAML options:
 *   type: custom:led-bar-card
 *   entity: sensor.battery        (required)
 *   name: Battery                 (default: entity friendly name)
 *   icon: mdi:battery             (default: entity icon)
 *   unit: "%"                     (default: entity unit)
 *   min_value: 0                  (default: 0)
 *   max_value: 100                (default: 100)
 *   show_name: true
 *   show_icon: true
 *   show_unit: true
 *   name_font_size: 14            (px, name shown under the bar)
 *   name_position: mid            (left | mid | end – aligned to the bar's edges)
 *   reverse_colours: false        (true = green at min → red at max)
 */

const SEGMENTS = 20;

// Colour stops (HSL hue): red → #F59C20 (orange, midpoint) → green
const HUE_START = 0;    // red
const HUE_MID = 35;     // #F59C20
const HUE_END = 120;    // green
const MID_INDEX = SEGMENTS / 2 - 1; // segment 10 of 20 is exactly #F59C20

function segmentHue(i) {
  if (i <= MID_INDEX) return HUE_START + ((HUE_MID - HUE_START) * i) / MID_INDEX;
  return HUE_MID + ((HUE_END - HUE_MID) * (i - MID_INDEX)) / (SEGMENTS - 1 - MID_INDEX);
}

const DEFAULTS = {
  min_value: 0,
  max_value: 100,
  show_name: true,
  show_icon: true,
  show_unit: true,
  name_font_size: 14,
  name_position: "mid",
  reverse_colours: false,
};

class LedBarCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("led-bar-card-editor");
  }

  static getStubConfig(hass) {
    const entity =
      Object.keys(hass.states).find(
        (id) => id.startsWith("sensor.") && !isNaN(parseFloat(hass.states[id].state))
      ) || "";
    return { entity, ...DEFAULTS };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error("Please choose an entity");
    this._config = { ...DEFAULTS, ...config };
    this._lastState = undefined;
    this._build();
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    const stateObj = this._config && hass.states[this._config.entity];
    if (stateObj !== this._lastState) {
      this._lastState = stateObj;
      this._update();
    }
  }

  getCardSize() {
    return this._config && this._config.show_name ? 2 : 1;
  }

  getGridOptions() {
    const rows = this._config && this._config.show_name ? 2 : 1;
    return { columns: 12, rows, min_rows: 1 };
  }

  _build() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const segs = Array.from({ length: SEGMENTS }, (_, i) => {
      const idx = this._config.reverse_colours ? SEGMENTS - 1 - i : i;
      const hue = Math.round(segmentHue(idx) * 10) / 10;
      return `<div class="seg" style="--h:${hue}"></div>`;
    }).join("");

    this.shadowRoot.innerHTML = `
      <style>
        ha-card { cursor: pointer; height: 100%; box-sizing: border-box; }
        .row {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 16px; height: 100%; box-sizing: border-box;
        }
        .icon { flex: 0 0 auto; color: var(--state-icon-color, var(--paper-item-icon-color)); }
        .meter {
          flex: 1 1 auto; min-width: 0;
          display: flex; flex-direction: column; gap: 6px;
        }
        .name {
          width: 100%; box-sizing: border-box;
          text-align: center;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          font-weight: 500; line-height: 1.2; color: var(--primary-text-color);
        }
        .bar { display: flex; gap: 3px; height: 36px; }
        .seg {
          flex: 1 1 0; border-radius: 2px;
          background: linear-gradient(to right,
            hsl(var(--h) 70% 5%),
            hsl(var(--h) 60% 13%) 50%,
            hsl(var(--h) 70% 5%));
          transition: background 0.3s, box-shadow 0.3s;
        }
        .seg.on {
          background: linear-gradient(to right,
            hsl(var(--h) 90% 20%),
            hsl(var(--h) 91% 54%) 38%,
            hsl(var(--h) 100% 70%) 50%,
            hsl(var(--h) 91% 54%) 62%,
            hsl(var(--h) 90% 20%));
          box-shadow: 0 0 6px hsl(var(--h) 100% 50% / 0.45);
        }
        .value {
          flex: 0 0 auto; min-width: 3.5em; text-align: right;
          font-weight: 600; font-size: 1.1em; color: var(--primary-text-color);
          white-space: nowrap;
        }
        .hidden { display: none; }
      </style>
      <ha-card>
        <div class="row">
          <div class="icon"></div>
          <div class="meter">
            <div class="bar">${segs}</div>
            <div class="name"></div>
          </div>
          <div class="value"></div>
        </div>
      </ha-card>
    `;

    this._els = {
      card: this.shadowRoot.querySelector("ha-card"),
      icon: this.shadowRoot.querySelector(".icon"),
      name: this.shadowRoot.querySelector(".name"),
      value: this.shadowRoot.querySelector(".value"),
      segs: [...this.shadowRoot.querySelectorAll(".seg")],
    };

    this._els.card.addEventListener("click", () => {
      const ev = new Event("hass-more-info", { bubbles: true, composed: true });
      ev.detail = { entityId: this._config.entity };
      this.dispatchEvent(ev);
    });
  }

  _update() {
    if (!this._els || !this._hass || !this._config) return;
    const c = this._config;
    const stateObj = this._hass.states[c.entity];
    const { icon, name, value, segs } = this._els;

    if (!stateObj) {
      name.textContent = `Entity not found: ${c.entity}`;
      name.classList.remove("hidden");
      value.textContent = "";
      segs.forEach((s) => s.classList.remove("on"));
      return;
    }

    // Icon
    icon.classList.toggle("hidden", !c.show_icon);
    if (c.show_icon) {
      let el = icon.firstElementChild;
      const tag = c.icon ? "ha-icon" : "ha-state-icon";
      if (!el || el.localName !== tag) {
        icon.innerHTML = "";
        el = document.createElement(tag);
        icon.appendChild(el);
      }
      if (c.icon) {
        el.icon = c.icon;
      } else {
        el.hass = this._hass;
        el.stateObj = stateObj;
      }
    }

    // Name
    name.classList.toggle("hidden", !c.show_name);
    name.textContent = c.name || stateObj.attributes.friendly_name || c.entity;
    name.style.fontSize = `${Number(c.name_font_size) || DEFAULTS.name_font_size}px`;
    name.style.textAlign = { left: "left", mid: "center", end: "right" }[c.name_position] || "center";

    // Value + unit
    const raw = parseFloat(stateObj.state);
    const unit = c.unit ?? stateObj.attributes.unit_of_measurement ?? "";
    if (isNaN(raw)) {
      value.textContent = stateObj.state;
    } else {
      const shown = Number.isInteger(raw) ? raw : Math.round(raw * 10) / 10;
      value.textContent = c.show_unit && unit ? `${shown} ${unit}` : `${shown}`;
    }

    // Segments
    const min = Number(c.min_value);
    const max = Number(c.max_value);
    let pct = 0;
    if (!isNaN(raw) && max !== min) {
      pct = Math.min(1, Math.max(0, (raw - min) / (max - min)));
    }
    const lit = Math.round(pct * SEGMENTS);
    segs.forEach((s, i) => s.classList.toggle("on", i < lit));
  }
}

/* ---------------- Visual editor ---------------- */

const SCHEMA = [
  { name: "entity", required: true, selector: { entity: {} } },
  { name: "name", selector: { text: {} } },
  {
    name: "name_position",
    selector: {
      select: {
        mode: "dropdown",
        options: [
          { value: "left", label: "Left (start of bar)" },
          { value: "mid", label: "Middle" },
          { value: "end", label: "End (end of bar)" },
        ],
      },
    },
  },
  {
    name: "name_font_size",
    selector: { number: { min: 8, max: 40, step: 1, mode: "slider", unit_of_measurement: "px" } },
  },
  { name: "icon", selector: { icon: {} }, context: { icon_entity: "entity" } },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "min_value", selector: { number: { mode: "box", step: "any" } } },
      { name: "max_value", selector: { number: { mode: "box", step: "any" } } },
    ],
  },
  { name: "unit", selector: { text: {} } },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "show_name", selector: { boolean: {} } },
      { name: "show_icon", selector: { boolean: {} } },
      { name: "show_unit", selector: { boolean: {} } },
    ],
  },
  { name: "reverse_colours", selector: { boolean: {} } },
];

const LABELS = {
  entity: "Entity",
  name: "Name (optional)",
  name_position: "Name position",
  name_font_size: "Name font size",
  icon: "Icon (optional)",
  min_value: "Minimum value",
  max_value: "Maximum value",
  unit: "Unit (optional)",
  show_name: "Show name",
  show_icon: "Show icon",
  show_unit: "Show unit",
  reverse_colours: "Reverse colours (green → red)",
};

class LedBarCardEditor extends HTMLElement {
  async connectedCallback() {
    // Make sure HA's form components are loaded
    if (!customElements.get("ha-form") && window.loadCardHelpers) {
      const helpers = await window.loadCardHelpers();
      const card = await helpers.createCardElement({ type: "entities", entities: [] });
      await card.constructor.getConfigElement();
    }
    this._render();
  }

  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => LABELS[s.name] ?? s.name;
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const config = { ...ev.detail.value };
        ["name", "icon", "unit"].forEach((k) => {
          if (config[k] === "" || config[k] == null) delete config[k];
        });
        this.dispatchEvent(
          new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true })
        );
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = { ...DEFAULTS, ...this._config };
    this._form.schema = SCHEMA;
  }
}

customElements.define("led-bar-card", LedBarCard);
customElements.define("led-bar-card-editor", LedBarCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "led-bar-card",
  name: "LED Bar Card",
  description: "20-segment LED meter with a red-to-green gradient.",
  preview: true,
});

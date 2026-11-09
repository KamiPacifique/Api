const { title, apiUrl, headers } = window.APP_CONFIG;

const titleEl = document.getElementById("title");
const statusEl = document.getElementById("status");
const outputEl = document.getElementById("output");
const refreshBtn = document.getElementById("refresh");
const addBtn = document.getElementById("add");
const dialog = document.getElementById("artist-dialog");
const form = document.getElementById("artist-form");
const formTitle = document.getElementById("form-title");
const nameInput = document.getElementById("artist-name");
const avatarInput = document.getElementById("artist-avatar");
const formError = document.getElementById("form-error");
const saveBtn = document.getElementById("form-save");
const cancelBtn = document.getElementById("form-cancel");

let editing = null; // The artist being edited, or null when adding a new one.
let latestLoad = 0; // Lets a newer load win if two overlap.

titleEl.textContent = title;
document.title = title;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function el(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderTable(rows) {
  const columns = [...new Set(rows.flatMap(Object.keys))];
  const table = el("table");

  const headRow = table.createTHead().insertRow();
  for (const column of columns) {
    const th = el("th", column);
    th.scope = "col";
    headRow.append(th);
  }

  const body = table.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const column of columns) {
      tr.insertCell().append(render(row[column]));
    }
  }

  const wrapper = el("div");
  wrapper.className = "table-wrap";
  wrapper.append(table);
  return wrapper;
}

function renderObject(object) {
  const list = el("dl");
  for (const [key, value] of Object.entries(object)) {
    const item = el("div");
    const description = el("dd");
    description.append(render(value));
    item.append(el("dt", key), description);
    list.append(item);
  }
  return list;
}

function renderList(items) {
  const list = el("ul");
  for (const item of items) {
    const li = el("li");
    li.append(render(item));
    list.append(li);
  }
  return list;
}

// Picks a layout from the shape of the JSON: a list of objects becomes a table,
// an object becomes label/value pairs, and anything else is shown as text.
function render(value) {
  if (value === null || value === undefined) return document.createTextNode("—");
  if (Array.isArray(value)) {
    if (value.length === 0) return document.createTextNode("(empty)");
    return value.every(isPlainObject) ? renderTable(value) : renderList(value);
  }
  if (isPlainObject(value)) return renderObject(value);
  return document.createTextNode(String(value));
}

function renderAvatar(name, url) {
  const wrapper = el("div");
  wrapper.className = "avatar";
  const showInitial = () => wrapper.replaceChildren(name.charAt(0).toUpperCase());

  if (!url) {
    showInitial();
    return wrapper;
  }

  const image = el("img");
  image.alt = "";
  image.loading = "lazy";
  image.addEventListener("error", showInitial);
  image.src = url;
  wrapper.append(image);
  return wrapper;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function renderArtist(artist) {
  // Any field beyond these (e.g. song or album details) is listed on the card.
  const { id, name, avatar, createdAt, ...details } = artist;

  const card = el("article");
  card.className = "card";
  card.append(renderAvatar(name, avatar), el("h2", name));

  const added = formatDate(createdAt);
  if (added) {
    const meta = el("p", `Added ${added}`);
    meta.className = "meta";
    card.append(meta);
  }

  if (Object.keys(details).length > 0) card.append(renderObject(details));

  const editBtn = el("button", "Edit");
  editBtn.type = "button";
  editBtn.className = "secondary";
  editBtn.setAttribute("aria-label", `Edit ${name}`);
  editBtn.addEventListener("click", () => openForm(artist));

  const deleteBtn = el("button", "Delete");
  deleteBtn.type = "button";
  deleteBtn.className = "danger";
  deleteBtn.setAttribute("aria-label", `Delete ${name}`);
  deleteBtn.addEventListener("click", () => deleteArtist(artist, deleteBtn));

  const actions = el("div");
  actions.className = "actions card-actions";
  actions.append(editBtn, deleteBtn);
  card.append(actions);
  return card;
}

function isArtistList(data) {
  return Array.isArray(data)
    && data.every((item) => isPlainObject(item) && typeof item.name === "string");
}

function renderArtists(artists) {
  const grid = el("div");
  grid.className = "cards";
  grid.append(...artists.map(renderArtist));
  return grid;
}

async function parseBody(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  if (!response.ok) {
    throw new Error(`The API responded with ${response.status} ${response.statusText}`.trim());
  }
  return parseBody(response);
}

function sendJson(url, method, body) {
  return apiFetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function artistUrl(id) {
  return `${apiUrl.replace(/\/$/, "")}/${encodeURIComponent(id)}`;
}

function errorMessage(error) {
  return error instanceof TypeError
    ? "Could not reach the API. Check the URL, your connection, and that the API allows requests from this site (CORS)."
    : error.message;
}

// `notice` describes what just changed and is shown ahead of the usual status.
async function loadData(notice) {
  if (!apiUrl) {
    outputEl.replaceChildren();
    setStatus("No API set yet. Add your URL to apiUrl in config.js.");
    refreshBtn.disabled = true;
    addBtn.disabled = true;
    return;
  }

  const thisLoad = ++latestLoad;
  refreshBtn.disabled = true;
  setStatus("Loading…");

  try {
    const data = await apiFetch(apiUrl);
    if (thisLoad !== latestLoad) return;

    const parts = notice ? [notice] : [];
    if (isArtistList(data)) {
      outputEl.replaceChildren(renderArtists(data));
      parts.push(`${data.length} ${data.length === 1 ? "artist" : "artists"}`);
    } else {
      outputEl.replaceChildren(render(data));
    }
    parts.push(`Updated ${new Date().toLocaleTimeString()}`);
    setStatus(parts.join(" · "));
  } catch (error) {
    if (thisLoad !== latestLoad) return;
    outputEl.replaceChildren();
    setStatus(errorMessage(error), true);
  } finally {
    if (thisLoad === latestLoad) refreshBtn.disabled = false;
  }
}

function openForm(artist = null) {
  editing = artist;
  formTitle.textContent = artist ? "Edit artist" : "Add artist";
  nameInput.value = artist?.name ?? "";
  avatarInput.value = artist?.avatar ?? "";
  formError.textContent = "";
  dialog.showModal();
}

async function saveArtist(event) {
  event.preventDefault();
  const target = editing;
  const name = nameInput.value.trim();
  const avatar = avatarInput.value.trim();

  saveBtn.disabled = true;
  formError.textContent = "";
  try {
    if (target) {
      // Send the whole record so fields this form doesn't show are kept.
      await sendJson(artistUrl(target.id), "PUT", { ...target, name, avatar });
    } else {
      await sendJson(apiUrl, "POST", { name, avatar });
    }
  } catch (error) {
    formError.textContent = errorMessage(error); // Stay open so nothing typed is lost.
    return;
  } finally {
    saveBtn.disabled = false;
  }

  dialog.close();
  loadData(target ? `Saved ${name}` : `Added ${name}`);
}

async function deleteArtist(artist, button) {
  if (!window.confirm(`Delete ${artist.name}? This can't be undone.`)) return;

  button.disabled = true;
  setStatus(`Deleting ${artist.name}…`);
  try {
    await apiFetch(artistUrl(artist.id), { method: "DELETE" });
  } catch (error) {
    setStatus(errorMessage(error), true);
    button.disabled = false;
    return;
  }
  loadData(`Deleted ${artist.name}`);
}

refreshBtn.addEventListener("click", () => loadData());
addBtn.addEventListener("click", () => openForm());
cancelBtn.addEventListener("click", () => dialog.close());
form.addEventListener("submit", saveArtist);
loadData();

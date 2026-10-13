/* admin.js — admin app (admin.html)
   OOP: AdminApp class, plus polymorphic Appointment classes from data.js
   DOM: createElement, textContent, addEventListener
   ASYNC: async/await for data, plus live updates (no page refresh needed) */

/* ---------- small helpers ---------- */

function makeButton(text, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

function addRow(body, cells, buttons) {
  const tr = document.createElement("tr");
  for (let i = 0; i < cells.length; i++) {
    const td = document.createElement("td");
    if (typeof cells[i] === "string") td.textContent = cells[i];
    else td.appendChild(cells[i]);
    tr.appendChild(td);
  }
  if (buttons) {
    const td = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "row-actions";
    for (let i = 0; i < buttons.length; i++) {
      wrap.appendChild(buttons[i]);
    }
    td.appendChild(wrap);
    tr.appendChild(td);
  }
  body.appendChild(tr);
}

function emptyRow(body, columns, text) {
  body.innerHTML = '<tr class="empty-row"><td colspan="' + columns + '">' + text + "</td></tr>";
}

function makePill(status) {
  const pill = document.createElement("span");
  pill.textContent = status;
  switch (status) {
    case "Done":
      pill.className = "pill pill-done";
      break;
    case "Cancelled":
      pill.className = "pill pill-cancelled";
      break;
    default:
      pill.className = "pill";
  }
  return pill;
}

// an appointment counts as "accepted by the admin" once it is no longer Pending/Rejected
function wasAccepted(a) {
  return a.status !== "Pending" && a.status !== "Rejected";
}

/* ---------- the app ---------- */

class AdminApp {
  constructor() {
    this.lastSnapshot = "";
    this.pending = 0;
  }

  async init() {
    const tabButtons = document.querySelectorAll("#adminNav button");
    for (let i = 0; i < tabButtons.length; i++) {
      tabButtons[i].addEventListener("click", (event) => this.showTab(event.currentTarget.dataset.tab));
    }
    $("summaryFilter").addEventListener("change", () => this.renderAll());
    $("scheduleVaxBtn").addEventListener("click", () => this.scheduleVaccination());
    $("vaxAnimalSelect").addEventListener("change", () => this.fillVaccineDropdown());
    $("vaxNextDate").min = today();

    await this.renderAll();

    window.addEventListener("storage", () => this.refresh());
    setInterval(() => this.refresh(), 3000);
  }

  showTab(tab) {
    const buttons = document.querySelectorAll("#adminNav button");
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle("active", buttons[i].dataset.tab === tab);
    }
    const panels = document.querySelectorAll(".tab-panel");
    for (let i = 0; i < panels.length; i++) {
      panels[i].classList.toggle("active", panels[i].id === "tab-" + tab);
    }
  }

  async refresh() {
    if (store.snapshot() === this.lastSnapshot) return;
    const before = this.pending;
    await this.renderAll();
    if (this.pending > before) showToast("New booking received");
  }

  async renderAll() {
    this.lastSnapshot = store.snapshot();
    const list = await store.getAppointments(); // polymorphic Appointment instances
    const vax = await store.getVaccinations();
    this.renderDashboard(list, vax);
    this.renderAppointments(list);
    this.renderRecords(list);
    this.renderSummary(list);
    this.renderVaccinationForm(list);
    this.renderVaccinations(vax);
  }

  async setStatus(id, status, message) {
    await store.setStatus(id, status);
    showToast(message);
    await this.renderAll();
  }

  /* ---------- dashboard ---------- */

  renderDashboard(list, vax) {
    const t = today();
    let animals = 0, appointments = 0, cancelled = 0, done = 0, upcoming = 0;
    this.pending = 0;
    const seen = {};

    for (let i = 0; i < list.length; i++) {
      const a = list[i];

      // total animals: only appointments the admin has accepted (Accepted/Done/Cancelled)
      if (wasAccepted(a) && !seen[a.animalName + a.email]) {
        seen[a.animalName + a.email] = true;
        animals++;
      }
      if (a.date === t && (a.status === "Pending" || a.status === "Accepted")) appointments++;

      switch (a.status) {
        case "Pending":
          this.pending++;
          break;
        case "Done":
          if (a.actionDate === t) done++;
          break;
        case "Cancelled":
          if (a.actionDate === t) cancelled++;
          break;
      }
    }
    // upcoming vaccinations starts at 0 and only grows as the admin schedules them
    upcoming = vax.length;

    $("statAnimals").textContent = animals;
    $("statAppointments").textContent = appointments;
    $("statCancelled").textContent = cancelled;
    $("statDone").textContent = done;
    $("statVax").textContent = upcoming;
    $("badgeAppointments").textContent = this.pending > 0 ? this.pending : "";
    $("todayLabel").textContent = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
  }

  /* ---------- appointments: accept / reject ---------- */

  renderAppointments(list) {
    const body = $("appointmentsBody");
    body.innerHTML = "";
    let count = 0;

    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.status !== "Pending") continue;
      count++;
      addRow(body, [
        a.ownerFirstName + " " + a.ownerLastName, a.animalName, a.species, a.getTypeLabel(),
        a.date + " · " + a.time, a.email + " · " + a.phone
      ], [
        makeButton("Accept", "btn btn-primary btn-sm", () => this.setStatus(a.id, "Accepted", "Appointment accepted")),
        makeButton("Reject", "btn btn-outline-danger btn-sm", () => this.setStatus(a.id, "Rejected", "Appointment rejected"))
      ]);
    }
    $("countPending").textContent = count + " request" + (count === 1 ? "" : "s");
    if (count === 0) emptyRow(body, 7, "No pending requests right now.");
  }

  /* ---------- patient records: done / cancel / delete ---------- */

  renderRecords(list) {
    const body = $("recordsBody");
    body.innerHTML = "";
    let count = 0;

    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.status !== "Accepted") continue;
      count++;
      addRow(body, [
        a.animalName, a.getTypeLabel(), a.age, a.breed, a.species, a.gender, a.weight, a.color,
        a.ownerFirstName + " " + a.ownerLastName, a.email + " · " + a.phone
      ], [
        makeButton("Done", "btn btn-primary btn-sm", () => this.setStatus(a.id, "Done", "Marked as done")),
        makeButton("Cancel", "btn btn-outline-danger btn-sm", () => this.setStatus(a.id, "Cancelled", "Appointment cancelled")),
        makeButton("Delete", "btn btn-ghost btn-sm", () => this.deleteRecord(a.id))
      ]);
    }
    $("countRecords").textContent = count + " patient" + (count === 1 ? "" : "s");
    if (count === 0) emptyRow(body, 11, "No active patients yet — accept a request first.");
  }

  async deleteRecord(id) {
    if (!confirm("Delete this patient record?")) return;
    await store.deleteAppointment(id);
    showToast("Record deleted");
    await this.renderAll();
  }

  /* ---------- patient summary: everything Done or Cancelled ---------- */

  renderSummary(list) {
    const body = $("summaryBody");
    body.innerHTML = "";
    const filter = $("summaryFilter").value;

    const rows = [];
    for (let i = 0; i < list.length; i++) {
      const finished = list[i].status === "Done" || list[i].status === "Cancelled";
      if (finished && (filter === "all" || list[i].status === filter)) rows.push(list[i]);
    }
    rows.sort((a, b) => (b.actionAt || 0) - (a.actionAt || 0));

    for (let i = 0; i < rows.length; i++) {
      const a = rows[i];
      addRow(body, [
        a.animalName + " (" + a.species + ")", a.ownerFirstName + " " + a.ownerLastName,
        a.email + " · " + a.phone, a.getTypeLabel(), makePill(a.status), a.actionDate, a.actionTime
      ]);
    }
    $("countSummary").textContent = rows.length + " patient" + (rows.length === 1 ? "" : "s");
    if (rows.length === 0) emptyRow(body, 7, "No completed or cancelled appointments yet.");
  }

  /* ---------- vaccination ---------- */

  // only animals booked for a Vaccination-type appointment show up here
  renderVaccinationForm(list) {
    const select = $("vaxAnimalSelect");
    const previous = select.value;
    select.innerHTML = '<option value="">Select animal…</option>';
    const seen = {};

    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.type !== "Vaccination" || !wasAccepted(a) || seen[a.id]) continue;
      seen[a.id] = true;
      const option = document.createElement("option");
      option.value = a.id;
      // pet + species + owner (+ booking date) so identical names can still be told apart
      option.textContent = a.animalName + " (" + a.species + ") — Owner: " + a.ownerFirstName + " " + a.ownerLastName +
        " · Appt " + a.date;
      option.dataset.species = a.species;
      option.dataset.animalName = a.animalName;
      option.dataset.ownerName = a.ownerFirstName + " " + a.ownerLastName;
      option.dataset.email = a.email;
      option.dataset.apptDate = a.date; // date the owner picked when booking
      option.dataset.apptTime = a.time;
      select.appendChild(option);
    }
    select.value = previous;
    this.fillVaccineDropdown();
  }

  // vaccine choices depend on the selected animal's species (switch-case via VACCINES_BY_SPECIES)
  fillVaccineDropdown() {
    const animalOption = $("vaxAnimalSelect").selectedOptions[0];
    const vaccineSelect = $("vaxVaccineType");

    this.showApptInfo(animalOption);

    if (!animalOption || !animalOption.value) {
      vaccineSelect.innerHTML = '<option value="">Select animal first</option>';
      return;
    }

    // keep the chosen vaccine if the list is re-rendered by the live refresh
    const previousVaccine = vaccineSelect.value;
    const species = animalOption.dataset.species;
    const options = VACCINES_BY_SPECIES[species] || [];
    vaccineSelect.innerHTML = '<option value="">Select vaccine</option>';
    for (let i = 0; i < options.length; i++) {
      const option = document.createElement("option");
      option.value = option.textContent = options[i];
      vaccineSelect.appendChild(option);
    }
    vaccineSelect.value = previousVaccine;
  }

  // shows the date the owner booked, so the admin can set the next schedule from it
  showApptInfo(animalOption) {
    const box = $("vaxApptInfo");
    if (!animalOption || !animalOption.value) {
      box.textContent = "Select an animal to see the date the owner booked.";
      box.classList.remove("on");
      return;
    }
    box.textContent = animalOption.dataset.animalName + " (" + animalOption.dataset.species + ") · Owner: " +
      animalOption.dataset.ownerName + " · Original appointment: " + animalOption.dataset.apptDate + " at " +
      animalOption.dataset.apptTime + " — now set the next schedule below.";
    box.classList.add("on");
  }

  async scheduleVaccination() {
    const animalOption = $("vaxAnimalSelect").selectedOptions[0];
    const vaccine = $("vaxVaccineType").value;
    const date = $("vaxNextDate").value;

    if (!animalOption || !animalOption.value || vaccine === "" || date === "") {
      showToast("Fill in animal, vaccine, and date first");
      return;
    }
    if (date < today()) {
      showToast("Vaccination date cannot be in the past");
      return;
    }

    await store.addVaccination({
      animalId: animalOption.value,
      animalName: animalOption.dataset.animalName,
      ownerName: animalOption.dataset.ownerName,
      email: animalOption.dataset.email,
      species: animalOption.dataset.species,
      vaccineType: vaccine,
      firstDate: animalOption.dataset.apptDate, // date ni owner sa appointment
      nextDate: date                            // date na nilagay ng admin
    });

    // auto-clear the form
    $("vaxAnimalSelect").value = "";
    $("vaxNextDate").value = "";
    $("vaxVaccineType").value = "";
    this.fillVaccineDropdown(); // goes back to "Select animal first"

    showToast("Schedule set — owner will see a reminder");
    await this.renderAll();
  }

  // two tables split by species, each showing the owner's booking date and the current next date
  renderVaccinations(vax) {
    $("vaxDogBody").innerHTML = "";
    $("vaxCatBody").innerHTML = "";

    for (let i = 0; i < vax.length; i++) {
      const v = vax[i];
      let body = $("vaxCatBody");
      switch (v.species) {
        case "Dog":
          body = $("vaxDogBody");
          break;
      }

      const dateInput = document.createElement("input");
      dateInput.type = "date";
      dateInput.value = v.nextDate;
      dateInput.min = today();
      dateInput.addEventListener("change", async () => {
        if (dateInput.value < today()) {
          showToast("Vaccination date cannot be in the past");
          dateInput.value = v.nextDate;
          return;
        }
        await store.updateVaccinationDate(v.id, dateInput.value);
        showToast("Next date updated — owner notified");
        await this.renderAll();
      });
      addRow(body, [
        String(v.animalName), String(v.ownerName), String(v.vaccineType), String(v.firstDate || "-")
      ], [dateInput]);
    }

    if (!$("vaxDogBody").children.length) emptyRow($("vaxDogBody"), 5, "No records yet.");
    if (!$("vaxCatBody").children.length) emptyRow($("vaxCatBody"), 5, "No records yet.");
  }
}

document.addEventListener("DOMContentLoaded", function () {
  new AdminApp().init();
});

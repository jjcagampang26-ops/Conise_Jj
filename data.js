/* data.js — shared by index.html and admin.html
   Records are kept as ARRAYS in localStorage. Store methods are async,
   so for SSMS later just replace them with fetch() calls to server.js.
   This file also has a small class hierarchy (inheritance + polymorphism)
   for appointment types — see "Appointment types" below. */

const APPT_KEY = "vetflow_appointments";
const VAX_KEY = "vetflow_vaccinations";

const CHECKUP_TYPES = ["General check-up", "Deworming", "Skin / allergy concern", "Follow-up visit"];

// clinic hours, in 24-hour minutes-since-midnight (9:00 AM – 10:00 PM)
const CLINIC_OPEN_MIN = 9 * 60;
const CLINIC_CLOSE_MIN = 22 * 60;

// "3", "30", "PM" -> minutes since midnight (24h), for clinic-hours checks
function timeToMinutes(hour12, minute, ampm) {
  let hour = parseInt(hour12, 10) % 12;
  if (ampm === "PM") hour += 12;
  return hour * 60 + parseInt(minute, 10);
}

const VACCINES_BY_SPECIES = {
  Dog: ["Rabies", "DHPP (Distemper/Hepatitis/Parvo)", "Bordetella (Kennel Cough)", "Leptospirosis"],
  Cat: ["Rabies", "FVRCP (Feline Distemper Combo)", "Feline Leukemia (FeLV)"]
};

function $(id) {
  return document.getElementById(id);
}

function today() {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function nowTime() {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// "shih tzu" -> "Shih Tzu"
function capitalize(text) {
  return text.toLowerCase().replace(/(^|[\s\-\/])(\p{L})/gu, function (match, before, letter) {
    return before + letter.toUpperCase();
  });
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(function () {
    toast.classList.remove("show");
  }, 2500);
}

/* ---------- appointment types (inheritance + polymorphism) ----------
   Appointment is the base class. Each subclass overrides getTypeLabel(),
   so calling rec.getTypeLabel() gives a different result depending on the
   actual (sub)class, without any if/switch at the call site. */

class Appointment {
  constructor(data) {
    Object.assign(this, data);
  }
  getTypeLabel() {
    return this.type;
  }
}

class GroomingAppointment extends Appointment {
  getTypeLabel() {
    return "Grooming";
  }
}

class VaccinationAppointment extends Appointment {
  getTypeLabel() {
    return "Vaccination";
  }
}

class CheckupAppointment extends Appointment {
  getTypeLabel() {
    return "Check-up — " + (this.checkupSubtype || "General");
  }
}

// factory: turns a plain stored object into the matching class (switch-case)
function createAppointment(data) {
  switch (data.type) {
    case "Grooming":
      return new GroomingAppointment(data);
    case "Vaccination":
      return new VaccinationAppointment(data);
    case "Check-up":
      return new CheckupAppointment(data);
    default:
      return new Appointment(data);
  }
}

/* ---------- data store (async) ---------- */

class Store {
  read(key) {
    return JSON.parse(localStorage.getItem(key) || "[]");
  }

  write(key, list) {
    localStorage.setItem(key, JSON.stringify(list));
  }

  // changes whenever any data (or the date) changes — admin.js uses it for live updates
  snapshot() {
    return today() + localStorage.getItem(APPT_KEY) + localStorage.getItem(VAX_KEY);
  }

  // returns Appointment/GroomingAppointment/etc. instances (polymorphic)
  async getAppointments() {
    const list = this.read(APPT_KEY);
    return list.map(createAppointment);
  }

  async addAppointment(data) {
    const list = this.read(APPT_KEY);
    data.id = "A" + Date.now();
    data.status = "Pending";
    list.push(data);
    this.write(APPT_KEY, list);
  }

  // status: Accepted, Rejected, Done or Cancelled
  async setStatus(id, status) {
    const list = this.read(APPT_KEY);
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        list[i].status = status;
        if (status === "Done" || status === "Cancelled") {
          list[i].actionDate = today();
          list[i].actionTime = nowTime();
          list[i].actionAt = Date.now();
        }
      }
    }
    this.write(APPT_KEY, list);
  }

  async deleteAppointment(id) {
    const list = this.read(APPT_KEY);
    const kept = [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].id !== id) kept.push(list[i]);
    }
    this.write(APPT_KEY, kept);
  }

  async getVaccinations() {
    return this.read(VAX_KEY);
  }

  // one row per animal + vaccine:
  //   firstDate = date the owner picked when booking (never changes)
  //   nextDate  = date the admin sets (updated every time the admin sets it again)
  async addVaccination(data) {
    const list = this.read(VAX_KEY);
    let existing = null;
    for (let i = 0; i < list.length; i++) {
      if (list[i].email === data.email &&
          list[i].animalName === data.animalName &&
          list[i].vaccineType === data.vaccineType) {
        existing = list[i];
      }
    }
    if (existing) {
      existing.nextDate = data.nextDate; // firstDate stays as is
    } else {
      data.id = "V" + Date.now();
      data.firstDate = data.firstDate || data.nextDate;
      list.push(data);
    }
    this.write(VAX_KEY, list);
  }

  async updateVaccinationDate(id, date) {
    const list = this.read(VAX_KEY);
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) list[i].nextDate = date;
    }
    this.write(VAX_KEY, list);
  }
}

const store = new Store();

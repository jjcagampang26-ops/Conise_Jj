/* script.js — owner site (index.html)
   OOP: BookingForm class | DOM: getElementById, createElement, addEventListener
   ASYNC: async/await when saving a booking or checking reminders

   INPUT RULES (Owner form + Pet details form)
   - Letters-only fields : first name, last name, animal name, breed, color
   - Numbers-only fields : phone (exactly 11 digits), age (max 2 digits),
                           weight (max 3 digits, up to 2 decimals)
   - Wrong characters are blocked as the user types and an "Important" notice is shown.
   - Too many digits is NOT silently cut: a notice appears and booking is blocked. */

class BookingForm {
  constructor() {
    this.step = 1;
    this.step1Ids = ["firstName", "lastName", "email", "phone"];
    this.step2Ids = ["animalName", "age", "breed", "gender", "weight", "color", "apptDate", "apptHour", "apptMinute", "apptAmPm"];

    // one rule per field that has a format (email stays as typed, never capitalized)
    this.rules = {
      firstName: { type: "letters", label: "First name" },
      lastName: { type: "letters", label: "Last name" },
      animalName: { type: "letters", label: "Animal name" },
      breed: { type: "letters", label: "Breed" },
      color: { type: "letters", label: "Color", allowSlash: true }, // e.g. Brown/White
      phone: { type: "digits", label: "Phone number", exact: 11, stopAt: 11 }, // typing/pasting stops at 11
      age: { type: "digits", label: "Age", max: 2 },
      weight: { type: "decimal", label: "Weight", maxWhole: 3, maxDecimals: 2 },
      email: { type: "email", label: "Email" }
    };

    // clinic hours (9:00 AM – 10:00 PM); falls back here if data.js doesn't define them
    this.clinicHours = typeof CLINIC_HOURS_BY_AMPM !== "undefined"
      ? CLINIC_HOURS_BY_AMPM
      : { AM: [9, 10, 11], PM: [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };
  }

  init() {
    this.fillCheckupDropdown();
    this.fillTimeDropdowns();
    $("apptDate").min = today();
    $("phone").maxLength = 11; // stops at 11 digits

    $("openBookingBtn").addEventListener("click", () => this.open());
    $("heroBookBtn").addEventListener("click", () => this.open());
    $("closeBookingBtn").addEventListener("click", () => this.close());
    $("doneBtn").addEventListener("click", () => this.close());
    $("nextStepBtn").addEventListener("click", () => this.next());
    $("backStepBtn").addEventListener("click", () => this.goTo(1));
    $("bookingForm").addEventListener("submit", (event) => {
      event.preventDefault();
      this.submit();
    });

    // typing clears the field's old error (added first, so the live checks below can show a new one)
    const allIds = this.step1Ids.concat(this.step2Ids, ["checkupSubtype"]);
    for (let i = 0; i < allIds.length; i++) {
      const id = allIds[i];
      $(id).addEventListener("input", () => this.clearError(id));
      $(id).addEventListener("change", () => this.clearError(id));
    }

    // live filtering, depending on each field's rule type (switch-case)
    for (const id in this.rules) {
      switch (this.rules[id].type) {
        case "letters":
          this.bindLettersField(id);
          break;
        case "digits":
        case "decimal":
          this.bindNumberField(id);
          break;
      }
    }

    // weight: "kg" is added once the field is left, and removed again for editing
    $("weight").addEventListener("focus", () => {
      $("weight").value = $("weight").value.replace(/\s*kg$/i, "");
    });
    $("weight").addEventListener("blur", () => {
      const value = $("weight").value.trim();
      if (value !== "") $("weight").value = value + " kg";
    });

    // appointment type (switch-case): only Check-up shows the extra dropdown
    const radios = document.querySelectorAll('input[name="apptType"]');
    for (let i = 0; i < radios.length; i++) {
      radios[i].addEventListener("change", (event) => {
        switch (event.target.value) {
          case "Check-up":
            $("checkupSubtypeField").style.display = "block";
            break;
          default:
            $("checkupSubtypeField").style.display = "none";
            $("checkupSubtype").value = "";
        }
      });
    }
  }

  /* ---------- live filtering ---------- */

  // letters only: numbers/symbols are removed and a notice is shown; text is auto-capitalized
  bindLettersField(id) {
    const input = $(id);
    const rule = this.rules[id];
    const notAllowed = rule.allowSlash ? /[^\p{L}\s'\-\/]/gu : /[^\p{L}\s'\-]/gu;

    input.addEventListener("input", () => {
      const position = input.selectionStart;
      const cleaned = input.value.replace(notAllowed, "");
      const removed = input.value.length - cleaned.length;

      input.value = capitalize(cleaned);
      const newPosition = Math.max(0, position - removed);
      input.setSelectionRange(newPosition, newPosition);

      if (removed > 0) {
        this.showError(id, "Important: " + rule.label + " accepts letters only — numbers and symbols are not allowed.");
      }
    });
  }

  // numbers only: letters are removed with a notice; too many digits shows a notice and blocks booking
  bindNumberField(id) {
    const input = $(id);
    const rule = this.rules[id];

    input.addEventListener("input", () => {
      const rawBefore = input.value;
      let cleaned = input.value.replace(rule.type === "decimal" ? /[^\d.]/g : /\D/g, "");
      if (rule.type === "decimal") {
        const parts = cleaned.split("."); // keep only the first decimal point
        cleaned = parts.length > 1 ? parts[0] + "." + parts.slice(1).join("") : cleaned;
      }
      if (rule.stopAt) cleaned = cleaned.slice(0, rule.stopAt); // extra digits are dropped automatically
      const removed = input.value.length - cleaned.length;
      input.value = cleaned;

      if (removed > 0 && !rule.stopAt) {
        this.showError(id, "Important: " + rule.label + " accepts numbers only — letters are not allowed.");
      }
      if (rule.stopAt && /[^\d]/.test(rawBefore)) {
        this.showError(id, "Important: " + rule.label + " accepts numbers only — letters are not allowed.");
      }
      const tooLong = this.lengthProblem(id, cleaned);
      if (tooLong !== "") this.showError(id, tooLong);
    });
  }

  /* ---------- dropdowns (array + loop) ---------- */

  fillCheckupDropdown() {
    const select = $("checkupSubtype");
    select.innerHTML = '<option value="">Select type of check-up</option>';
    for (let i = 0; i < CHECKUP_TYPES.length; i++) {
      const option = document.createElement("option");
      option.value = option.textContent = CHECKUP_TYPES[i];
      select.appendChild(option);
    }
  }

  fillTimeDropdowns() {
    const minuteSelect = $("apptMinute");
    minuteSelect.innerHTML = '<option value="">Min</option>';
    for (let m = 0; m < 60; m += 5) {
      const option = document.createElement("option");
      option.value = m;
      option.textContent = String(m).padStart(2, "0");
      minuteSelect.appendChild(option);
    }

    $("apptAmPm").addEventListener("change", () => this.fillHourOptions());
    this.fillHourOptions(); // empty until AM/PM is picked
  }

  // only clinic hours are offered, depending on AM or PM
  fillHourOptions() {
    const hourSelect = $("apptHour");
    const previous = hourSelect.value;
    hourSelect.innerHTML = '<option value="">Hour</option>';

    const hours = this.clinicHours[$("apptAmPm").value] || [];
    for (let i = 0; i < hours.length; i++) {
      const option = document.createElement("option");
      option.value = option.textContent = hours[i];
      hourSelect.appendChild(option);
    }
    hourSelect.value = hours.indexOf(Number(previous)) !== -1 ? previous : "";
  }

  open() {
    $("bookingOverlay").classList.add("open");
    this.goTo(1);
  }

  close() {
    $("bookingOverlay").classList.remove("open");
    $("bookingForm").reset();
    $("checkupSubtypeField").style.display = "none";
    this.clearErrors();
    this.fillHourOptions();
    this.goTo(1);
  }

  goTo(step) {
    const steps = document.querySelectorAll(".form-step");
    for (let i = 0; i < steps.length; i++) {
      steps[i].classList.remove("active");
    }
    let id = "step1";
    switch (step) {
      case 2:
        id = "step2";
        break;
      case "confirm":
        id = "stepConfirm";
        break;
    }
    $(id).classList.add("active");
    $("progress2").classList.toggle("active", step !== 1);
    this.step = step;
  }

  // the user cannot go to the pet details unless the owner details are valid
  next() {
    if (this.validate(this.step1Ids)) {
      this.goTo(2);
    } else {
      showToast("Please fix the highlighted fields first.");
    }
  }

  /* ---------- errors ---------- */

  showError(id, message) {
    const holder = document.querySelector('[data-error-for="' + id + '"]');
    if (holder) holder.textContent = message;
    $(id).classList.add("invalid");
  }

  clearError(id) {
    const holder = document.querySelector('[data-error-for="' + id + '"]');
    if (holder) holder.textContent = "";
    $(id).classList.remove("invalid");
  }

  clearErrors() {
    const messages = document.querySelectorAll(".field-error");
    for (let i = 0; i < messages.length; i++) {
      messages[i].textContent = "";
    }
    const bad = document.querySelectorAll(".invalid");
    for (let i = 0; i < bad.length; i++) {
      bad[i].classList.remove("invalid");
    }
  }

  /* ---------- validation ---------- */

  // returns a message if the number has too many (or too few) digits, otherwise ""
  lengthProblem(id, value) {
    const rule = this.rules[id];
    const label = rule.label;

    switch (rule.type) {
      case "digits":
        if (rule.exact && value.length > rule.exact) {
          return "Important: " + label + " is invalid — it must be exactly " + rule.exact + " digits.";
        }
        if (rule.max && value.length > rule.max) {
          return "Important: " + label + " is invalid — maximum of " + rule.max + " digits.";
        }
        break;
      case "decimal": {
        const parts = value.split(".");
        const decimals = parts.length > 1 ? parts[1].length : 0;
        if (parts[0].length > rule.maxWhole || decimals > rule.maxDecimals) {
          return "Important: " + label + " is invalid — up to " + rule.maxWhole + " digits, with at most " +
            rule.maxDecimals + " decimals (e.g. 12.5).";
        }
        break;
      }
    }
    return "";
  }

  // returns the problem with one field, or "" if it is fine
  checkField(id) {
    const rule = this.rules[id];
    let value = $(id).value.trim();
    if (id === "weight") value = value.replace(/\s*kg$/i, "");

    if (value === "") return "This field is required.";
    if (!rule) return "";

    switch (rule.type) {
      case "letters": {
        const pattern = rule.allowSlash ? /^\p{L}+([\s'\-\/]+\p{L}+)*$/u : /^\p{L}+([\s'\-]+\p{L}+)*$/u;
        if (!pattern.test(value)) {
          return "Important: " + rule.label + " accepts letters only — numbers and symbols are not allowed.";
        }
        break;
      }
      case "digits":
        if (!/^\d+$/.test(value)) {
          return "Important: " + rule.label + " accepts numbers only — letters are not allowed.";
        }
        if (this.lengthProblem(id, value) !== "") return this.lengthProblem(id, value);
        if (rule.exact && value.length < rule.exact) {
          return "Important: " + rule.label + " is incomplete — it must be exactly " + rule.exact + " digits.";
        }
        break;
      case "decimal":
        if (!/^\d+(\.\d+)?$/.test(value)) {
          return "Important: " + rule.label + " accepts numbers only — letters are not allowed.";
        }
        if (this.lengthProblem(id, value) !== "") return this.lengthProblem(id, value);
        if (parseFloat(value) <= 0) return "Important: " + rule.label + " must be more than 0.";
        break;
      case "email": {
        const problem = this.emailProblem(value);
        if (problem !== "") return problem;
        break;
      }
    }
    return "";
  }

  /* ---------- email check ---------- */

  // returns an "Important" message if the email is wrong, otherwise ""
  emailProblem(email) {
    if (/^\d+$/.test(email)) {
      return "Important: Email cannot be only numbers — use a format like name@gmail.com.";
    }
    if (email.indexOf("@") === -1) {
      return 'Important: Email must contain "@" (e.g. name@gmail.com).';
    }
    if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email)) {
      return "Important: Email needs a valid domain ending such as .com (e.g. name@gmail.com).";
    }

    const domain = email.split("@")[1].toLowerCase();
    const ending = domain.split(".").pop();
    if (!/[a-z]/.test(domain.slice(0, domain.length - ending.length))) {
      return "Important: Email domain is not valid — it needs a name like gmail before .com.";
    }
    const knownEndings = ["com", "net", "org", "edu", "gov", "ph", "io", "co", "info", "biz", "me", "us", "uk"];
    const knownDomains = ["gmail.com", "yahoo.com", "yahoo.com.ph", "ymail.com", "outlook.com", "hotmail.com",
      "live.com", "msn.com", "icloud.com", "me.com", "aol.com", "mail.com", "gmx.com", "proton.me", "protonmail.com"];

    // a typo of a popular domain, e.g. gmai.com / gmail.con / yahho.com
    if (knownDomains.indexOf(domain) === -1) {
      for (let i = 0; i < knownDomains.length; i++) {
        const allowed = knownDomains[i].length >= 9 ? 2 : 1;
        if (this.editDistance(domain, knownDomains[i]) <= allowed) {
          return "Important: Email domain looks like a typo — did you mean " + email.split("@")[0] + "@" + knownDomains[i] + "?";
        }
      }
    }
    if (knownEndings.indexOf(ending) === -1) {
      return "Important: Email domain ending \"." + ending + "\" is not valid — use something like .com";
    }
    return "";
  }

  // number of single-letter changes needed to turn a into b (for typo detection)
  editDistance(a, b) {
    const row = [];
    for (let j = 0; j <= b.length; j++) row.push(j);
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const keep = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
        previous = keep;
      }
    }
    return row[b.length];
  }

  // checks every field in the list; shows a message under each bad one; true only if all are fine
  validate(ids) {
    let ok = true;
    for (let i = 0; i < ids.length; i++) {
      const problem = this.checkField(ids[i]);
      if (problem !== "") {
        this.showError(ids[i], problem);
        ok = false;
      }
    }
    return ok;
  }

  validateStep2() {
    let ok = this.validate(this.step2Ids);

    if (this.radio("apptType") === "Check-up" && $("checkupSubtype").value === "") {
      this.showError("checkupSubtype", "Please choose a type of check-up.");
      ok = false;
    }
    if ($("apptDate").value !== "" && $("apptDate").value < today()) {
      this.showError("apptDate", "Date cannot be in the past.");
      ok = false;
    }
    return ok;
  }

  /* ---------- submit ---------- */

  radio(name) {
    const checked = document.querySelector('input[name="' + name + '"]:checked');
    return checked ? checked.value : "";
  }

  val(id) {
    return $(id).value.trim();
  }

  submit() {
    if (this.step === 1) {
      this.next();
      return;
    }

    // booking is blocked while ANY field is invalid (both forms are checked)
    const owner = this.validate(this.step1Ids);
    const pet = this.validateStep2();
    if (!owner || !pet) {
      showToast("Booking blocked — please fix the highlighted fields.");
      if (!owner) this.goTo(1);
      return;
    }

    const type = this.radio("apptType");
    const weight = this.val("weight").replace(/\s*kg$/i, "") + " kg";
    const time = $("apptHour").value + ":" + String($("apptMinute").value).padStart(2, "0") + " " + $("apptAmPm").value;

    const data = {
      ownerFirstName: capitalize(this.val("firstName")),
      ownerLastName: capitalize(this.val("lastName")),
      email: this.val("email"),
      phone: this.val("phone"),
      animalName: capitalize(this.val("animalName")),
      age: this.val("age"),
      breed: capitalize(this.val("breed")),
      species: this.radio("species"),
      gender: this.val("gender"),
      weight: weight,
      color: capitalize(this.val("color")),
      type: type,
      checkupSubtype: type === "Check-up" ? this.val("checkupSubtype") : "",
      date: this.val("apptDate"),
      time: time
    };

    this.save(data);
  }

  async save(data) {
    try {
      await store.addAppointment(data);
      this.goTo("confirm");
    } catch (error) {
      showToast("Could not send your request. Please try again.");
    }
  }
}

/* ---------- notification bell (no red-dot indicator) ---------- */

async function lookupNotifications() {
  const email = $("notifEmail").value.trim().toLowerCase();
  const box = $("notifResults");
  box.innerHTML = "";

  const list = await store.getVaccinations();
  let found = 0;
  for (let i = 0; i < list.length; i++) {
    if (email !== "" && list[i].email.toLowerCase() === email) {
      const item = document.createElement("div");
      item.className = "notif-item";
      item.textContent = list[i].animalName + " — " + list[i].vaccineType + " on " + list[i].nextDate;
      box.appendChild(item);
      found++;
    }
  }
  if (found === 0) box.innerHTML = '<p class="empty-note">No reminders for this email.</p>';
}

document.addEventListener("DOMContentLoaded", function () {
  new BookingForm().init();
  $("notifToggle").addEventListener("click", () => $("notifPanel").classList.toggle("open"));
  $("notifCheckBtn").addEventListener("click", lookupNotifications);
});

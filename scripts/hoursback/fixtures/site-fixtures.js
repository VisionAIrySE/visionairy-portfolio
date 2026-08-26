// Recorded sample web pages — the same shapes real Central Oregon business
// sites use. Every enrichment check reads these, so the checks prove the
// reader works without ever touching the internet.
module.exports = {
  // A plumbing outfit doing everything by hand: paper forms, a fax number,
  // no way to book, no login, and a live opening for a receptionist.
  manualPlumber: {
    domain: 'highdesertplumbing.com',
    pages: [
      {
        url: 'https://highdesertplumbing.com/',
        html: `<html><body>
          <h1>High Desert Plumbing</h1>
          <p>Serving Bend since 1994. Call us at (541) 555-0142. Fax: 541-555-0143</p>
          <p>Our team of 12 licensed plumbers covers all of Central Oregon.</p>
          <a href="/about">About Us</a> <a href="/careers">Careers</a> <a href="/contact">Contact</a>
          <a href="https://facebook.com/hdp">Facebook</a>
        </body></html>`,
      },
      {
        url: 'https://highdesertplumbing.com/about',
        html: `<html><body><h2>About</h2>
          <p>Dale Hutchins, Owner, started the company out of his truck in 1994.</p>
          <a href="/forms/new-customer-application.pdf">New Customer Application (PDF)</a>
        </body></html>`,
      },
      {
        url: 'https://highdesertplumbing.com/careers',
        html: `<html><body><h2>Careers</h2>
          <p>We are hiring! Open position: Receptionist / scheduler, full time.</p>
          <p>Send resumes to <a href="mailto:dale@highdesertplumbing.com">dale@highdesertplumbing.com</a></p>
        </body></html>`,
      },
    ],
  },

  // A dental office that is already automated: online booking, patient
  // portal, no fax, no paper forms. Low score — call it later.
  automatedDental: {
    domain: 'cascadesmiles.com',
    pages: [
      {
        url: 'https://cascadesmiles.com/',
        html: `<html><body>
          <h1>Cascade Smiles Dental</h1>
          <a href="https://calendly.com/cascadesmiles">Book Now</a>
          <a href="/patient-portal">Patient Portal</a>
          <p>Our staff of 8 is here for you. Questions? <a href="mailto:info@cascadesmiles.com">info@cascadesmiles.com</a></p>
        </body></html>`,
      },
    ],
  },

  // Publishes a range rather than a number.
  rangePublisher: {
    domain: 'sistersmillwork.com',
    pages: [
      {
        url: 'https://sistersmillwork.com/about',
        html: `<html><body><h1>Sisters Millwork</h1>
          <p>Depending on the season we run 8 to 20 employees out of our Sisters shop.</p>
          <a href="https://book.housecallpro.com/book/x">Schedule online</a>
          <a href="/login">Customer portal login</a>
        </body></html>`,
      },
    ],
  },

  // A single page that says almost nothing. Scores what it scores, keeps its
  // place on the list.
  emptyShell: {
    domain: 'redmondsigns.com',
    pages: [
      { url: 'https://redmondsigns.com/', html: `<html><body><h1>Redmond Signs</h1>
        <a href="https://calendly.com/redmondsigns">Book an appointment</a>
        <a href="/client-login">Client Login</a></body></html>` },
    ],
  },

  // A staff page listing the people who already work there. Naming an office
  // role is NOT a job opening — this must never score as one.
  staffBioNotHiring: {
    domain: 'gregelder.example',
    pages: [
      {
        url: 'https://gregelder.example/team',
        html: `<html><body><h1>Meet our team</h1>
          <p>Brennan Bell. Office Manager. License #19540233. <a href="/bio">Read bio</a></p>
          <p>Hayden Miller. Account Representative. Hayden joined the agency in 2019.</p>
          <a href="/careers">Careers</a>
          <a href="https://calendly.com/ge">Book an appointment</a>
          <a href="/my-account">My Account</a>
        </body></html>`,
      },
    ],
  },

  // A real opening, with the language a posting actually uses.
  realJobPosting: {
    domain: 'baxterlaw.example',
    pages: [
      {
        url: 'https://baxterlaw.example/careers',
        html: `<html><body><h1>Job Opportunities</h1>
          <p>Receptionist &mdash; full-time position. We are seeking a receptionist to join our
          front office. Apply now: send your resume to hiring@baxterlaw.example.</p>
          <a href="https://calendly.com/bl">Book a consult</a>
          <a href="/client-login">Client Login</a>
        </body></html>`,
      },
    ],
  },

  // The website's own plumbing leaks fake addresses — none of them are the
  // business.
  junkEmailsOnly: {
    domain: 'prinevillefeed.com',
    pages: [
      {
        url: 'https://prinevillefeed.com/',
        html: `<html><body><h1>Prineville Feed</h1>
          <img src="logo@2x.png">
          <a href="mailto:noreply@prinevillefeed.com">do not reply</a>
          <script>Sentry.init({dsn:"https://abc@o123.sentry.io/45"})</script>
          <a href="https://calendly.com/pf">Book online</a>
          <a href="/my-account">My Account</a>
        </body></html>`,
      },
    ],
  },
};

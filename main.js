// Endpoint: /identify
const db = require('./db');
const express = require('express');
const app = express();
app.use(express.json());

app.post('/identify', (req, res) => {
  const { email, phoneNumber } = req.body;

  // Query the database to find matching contacts
  db.query(
    `
    SELECT *
    FROM Contact
    WHERE email = ? OR phoneNumber = ?
    ORDER BY linkPrecedence ASC, createdAt ASC
    `,
    [email, phoneNumber],
    (error, results) => {
      if (error) {
        console.error('Database query error:', error);
        return res.status(500).json({ error: 'An error occurred during the database query.' });
      }

      if (results.length === 0) {
        // No existing contacts found, create a new primary contact
        const newContact = {
          phoneNumber,
          email,
          linkedId: null,
          linkPrecedence: 'primary',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        };

        // Insert the new contact into the database
        db.query('INSERT INTO Contact SET ?', newContact, (error, result) => {
          if (error) {
            console.error('Database insert error:', error);
            return res.status(500).json({ error: 'An error occurred during the database insert.' });
          }

          const primaryContactId = result.insertId;
          const consolidatedContact = {
            primaryContatctId: primaryContactId,
            emails: [email],
            phoneNumbers: [phoneNumber],
            secondaryContactIds: [],
          };

          res.status(200).json({ contact: consolidatedContact });
        });
      } else {
        handleExistingContacts(results, email, phoneNumber, res);
      }
    }
  );
});

function handleExistingContacts(results, email, phoneNumber, res) {
  const primaryContact = results.find(contact => contact.linkPrecedence === 'primary');
  const secondaryContacts = results.filter(
    contact => contact.linkPrecedence === 'secondary' && (contact.email !== email || contact.phoneNumber !== phoneNumber)
  );

  if (secondaryContacts.length === 0 && (primaryContact.email !== email || primaryContact.phoneNumber !== phoneNumber)) {
    createSecondaryContact(primaryContact, email, phoneNumber, res);
  } else if (primaryContact.email !== email || primaryContact.phoneNumber !== phoneNumber) {
    updatePrimaryContact(primaryContact, email, phoneNumber, secondaryContacts, res);
  } else {
    consolidateContacts(primaryContact, secondaryContacts, res);
  }
}

function createSecondaryContact(primaryContact, email, phoneNumber, res) {
  const newSecondaryContact = {
    phoneNumber,
    email,
    linkedId: primaryContact.id,
    linkPrecedence: 'secondary',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  // Insert the new secondary contact into the database
  db.query('INSERT INTO Contact SET ?', newSecondaryContact, (error, result) => {
    if (error) {
      console.error('Database insert error:', error);
      return res.status(500).json({ error: 'An error occurred during the database insert.' });
    }

    const secondaryContactId = result.insertId;
    const consolidatedContact = {
      primaryContatctId: primaryContact.id,
      emails: [primaryContact.email, email],
      phoneNumbers: [primaryContact.phoneNumber, phoneNumber],
      secondaryContactIds: [secondaryContactId],
    };

    res.status(200).json({ contact: consolidatedContact });
  });
}

function updatePrimaryContact(primaryContact, email, phoneNumber, secondaryContacts, res) {
  // Update the primary contact to secondary
  db.query(
    'UPDATE Contact SET linkPrecedence = "secondary", updatedAt = ? WHERE id = ?',
    [new Date(), primaryContact.id],
    (error, result) => {
      if (error) {
        console.error('Database update error:', error);
        return res.status(500).json({ error: 'An error occurred during the database update.' });
      }

      const secondaryContact = {
        phoneNumber,
        email,
        linkedId: primaryContact.id,
        linkPrecedence: 'secondary',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      // Insert the new secondary contact into the database
      db.query('INSERT INTO Contact SET ?', secondaryContact, (error, result) => {
        if (error) {
          console.error('Database insert error:', error);
          return res.status(500).json({ error: 'An error occurred during the database insert.' });
        }

        const secondaryContactId = result.insertId;
        const consolidatedContact = {
          primaryContatctId: primaryContact.id,
          emails: [primaryContact.email, email],
          phoneNumbers: [primaryContact.phoneNumber, phoneNumber],
          secondaryContactIds: [secondaryContactId],
        };

        res.status(200).json({ contact: consolidatedContact });
      });
    }
  );
}

function consolidateContacts(primaryContact, secondaryContacts, res) {
  const contactIds = [primaryContact.id, ...secondaryContacts.map(contact => contact.id)];
  const emails = [primaryContact.email, ...secondaryContacts.map(contact => contact.email)];
  const phoneNumbers = [primaryContact.phoneNumber, ...secondaryContacts.map(contact => contact.phoneNumber)];
  const secondaryContactIds = secondaryContacts.map(contact => contact.id);

  const consolidatedContact = {
    primaryContactId: primaryContact.id,
    emails,
    phoneNumbers,
    secondaryContactIds,
  };

  res.status(200).json({ contact: consolidatedContact });
}


app.listen(3000, () => {
  console.log(`Server is running on port 3000`);
});



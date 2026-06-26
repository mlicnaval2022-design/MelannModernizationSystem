# Tasks

- [x] **Database Schema**: Update `server/src/db/database.js` to create `tblCICSubmissionBatch` and `tblCICSubmissionRecord`.
- [x] **Backend**: Implement `server/src/routes/cic.js` to handle `POST /validate`, `POST /generate`, `GET /history`, and `GET /readiness/:customerId`.
- [x] **Backend**: Hook up `cicRoutes` in `server/src/index.js` as `app.use('/api/cic', cicRoutes);`.
- [x] **Frontend**: Update `client/src/pages/GovernmentCompliance.jsx` to replace old logic with new CIC generation tools (Year/Month selectors, Validate, Generate, History).
- [x] **Frontend**: Update Client Profile views (`client/src/pages/Customers.jsx`) to fetch `/api/cic/readiness/:id` and display the status badge (🟢/🟡).
- [x] **Documentation**: Create `walkthrough.md`.

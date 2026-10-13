'use strict';

const { registerUserRoutes } = require('./routes/user');
const { registerActionRoutes } = require('./routes/actions');
const { registerOrgRoutes } = require('./routes/orgs');
const { registerRepRoutes } = require('./routes/reps');
const { registerLocalRoutes } = require('./routes/local');
const { registerBankRoutes } = require('./routes/bank');
const { registerWorkshopRoutes } = require('./routes/workshop');
const { registerEveryorgRoutes } = require('./routes/everyorg');

function mountIndividualRoutes(app, pool) {
  registerUserRoutes(app, pool);
  registerActionRoutes(app, pool);
  registerOrgRoutes(app, pool);
  registerRepRoutes(app, pool);
  registerLocalRoutes(app, pool);
  registerBankRoutes(app, pool);
  registerWorkshopRoutes(app, pool);
  registerEveryorgRoutes(app, pool);
}

module.exports = { mountIndividualRoutes };

const
  fs = require('fs'),
  https = require('https'),
  Configstore = require('configstore'),
  createDebug = require('debug'),
  express = require('express'),
  bodyParser = require('body-parser'),
  app = express(),
  CONFIG = require('./config.json'),
  PORT = (!process.argv.find((e) => e === '-d')) ? 3000 : 3001,
  debug = createDebug('mc-bao-bao-server:debug'),
  info = createDebug('mc-bao-bao-server:info'),
  error = createDebug('mc-bao-bao-server:error'),
  sslConf = new Configstore('ssl', {
    key: '',
    cert: '',
    ca: ''
  });

debug('ssl config => %O', sslConf.all);

app.use(function(req, res, next) {
  res.append('Access-Control-Allow-Credentials', 'true');
  res.append('Access-Control-Allow-Headers', 'accept, authorization, content-type, x-requested-with');
  res.append('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
  res.append('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS')
    return res.sendStatus(200);
  return next();
});
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

const
  Sequelize = require('sequelize'),
  sequelize = new Sequelize(CONFIG.db_name, CONFIG.db_account, CONFIG.db_password, {
    dialect: 'mysql',
    dialectOptions: {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      supportBigNumbers: true,
      bigNumberStrings: true
    },
    logging: false
  });

const
  Comment = sequelize.define('comment', {
    anonymous: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    content: {
      type: Sequelize.STRING(1023),
      allowNull: false,
      defaultValue: 'oops!! 沒內容!?'
    },
  }, {
    indexes: [{
      unique: true,
      fields: ['courseId', 'userId']
    }]
  }),
  User = sequelize.define('user', {
    email: {
      type: Sequelize.STRING,
      allowNull: false
    },
    name: {
      type: Sequelize.STRING,
      allowNull: false
    }
  }),
  Course = sequelize.define('course', {
    courseClass: {
      type: Sequelize.STRING,
      allowNull: false
    },
    courseName: {
      type: Sequelize.STRING,
      allowNull: false
    }
  }, {
    indexes: [{
      unique: true,
      fields: ['courseClass', 'courseName']
    }]
  }),
  Thumb = sequelize.define('thumb', {}, {
    indexes: [{
      unique: true,
      fields: ['commentId', 'userId']
    }]
  }),
  Request = sequelize.define('request', {}, {
    indexes: [{
      unique: true,
      fields: ['courseId', 'userId']
    }]
  });

User.hasMany(Comment);
Course.hasMany(Comment);
Comment.hasMany(Thumb);
User.hasMany(Thumb);
Course.hasMany(Request);
User.hasMany(Request);

Comment.belongsTo(User);
Comment.belongsTo(Course);
Thumb.belongsTo(Comment);
Thumb.belongsTo(User);
Request.belongsTo(Course);
Request.belongsTo(User);

sequelize.sync()
  .then(function() {}, (err) => console.error(err));

const api1_0 = require('./api/1.0.js')(sequelize, express, {
  Comment,
  User,
  Course,
  Thumb,
  Request
}, {
  debug,
  error,
  info
});

app.use('/v1.0', api1_0);
app.use('', api1_0);

{
  const httpsOption = {};
  for (let key in sslConf.all) {
    if (fs.existsSync(sslConf.get(key)))
      httpsOption[key] = fs.readFileSync(sslConf.get(key));
    else
      httpsOption[key] = void 0;
  }
  if (httpsOption.cert && httpsOption.key && httpsOption.ca)
    https.createServer(httpsOption, app).listen(PORT, function() {
      info('https listen on port => %d', PORT);
    });
  else
    app.listen(PORT, function() {
      info('http listen on port => %d', PORT);
    });
}

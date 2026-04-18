const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const User = require('./models/User');
  const users = await User.find({ role: 'student' }).select('name email phone');
  users.forEach(u => console.log(u.name, '|', u.email, '|', u.phone));
  process.exit();
}).catch(e => console.log(e.message));

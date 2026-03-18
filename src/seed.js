require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const Service = require('./models/Service');
const Settings = require('./models/Settings');

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Create default admin
    const existingAdmin = await Admin.findOne({ email: 'admin@vehiclean.com' });
    if (!existingAdmin) {
      await Admin.create({
        email: 'admin@vehiclean.com',
        password: 'admin123',
        name: 'Super Admin',
      });
      console.log('Default admin created: admin@vehiclean.com / admin123');
    }

    // Create default services
    const serviceCount = await Service.countDocuments();
    if (serviceCount === 0) {
      await Service.insertMany([
        { name: 'Basic Wash', description: 'Exterior wash with water and soap', price: 299, duration: 30, category: 'wash' },
        { name: 'Premium Wash', description: 'Full exterior + interior cleaning', price: 599, duration: 60, category: 'wash' },
        { name: 'Deep Clean', description: 'Complete deep cleaning with polish', price: 999, duration: 90, category: 'wash' },
        { name: 'Interior Detailing', description: 'Full interior vacuum, dashboard, seats', price: 799, duration: 75, category: 'detailing' },
        { name: 'Exterior Polish', description: 'Rubbing compound + wax finish', price: 1499, duration: 120, category: 'detailing' },
        { name: 'Ceramic Coating', description: 'Long-lasting ceramic protection', price: 4999, duration: 180, category: 'premium' },
      ]);
      console.log('Default services created');
    }

    // Create default settings
    const existingSettings = await Settings.findOne();
    if (!existingSettings) {
      await Settings.create({
        supportPhone: '+91 9876543210',
        supportEmail: 'support@vehiclean.com',
        cancellationCharges: 50,
        defaultCommission: 20,
      });
      console.log('Default settings created');
    }

    console.log('Seed completed!');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seed();

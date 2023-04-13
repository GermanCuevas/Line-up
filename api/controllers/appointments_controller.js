const { appointmentConfirmation } = require("../config/emailConfirmation");
const { validateToken } = require("../config/token");
const AppointmentsService = require("../services/appointment_services");
const BranchsService = require("../services/branch_services");
const UsersService = require("../services/user_services");
const { DateTime } = require("luxon");
const moment = require("moment");

const createAppointment = async (req, res) => {
  const { branch, name, email, phoneNew, day, time } = req.body;
  const lastAppointment = await AppointmentsService.findLastAppointment();
  try {
    const selectedBranch = await BranchsService.getSingleBranch(branch);
    const { allowedClients, openingHour, closingHour } = selectedBranch.data[0];
    const user = await UsersService.searchUserByEmail(email);
    const fullAppointment =
      await AppointmentsService.validationAvailabilityAppointment(day, time);
    if (fullAppointment.data.length < allowedClients) {
      let appointment = {
        date: day,
        timeOfAppoinment: time,
        idApp: lastAppointment.data.idApp + 1,
        user: {
          id: user.data._id,
          name: name,
          email: email,
          phone: phoneNew,
        },
        sucursal: {
          id: selectedBranch.data[0]._id,
          name: branch,
          allowedClients: allowedClients,
          openingHour: openingHour,
          closingHour: closingHour,
        },
      };
      const newAppointment = AppointmentsService.createAppointment(appointment);
      if (user?.data?.phone) {
        if (user.data.phone !== phoneNew) {
          await UsersService.updateUserPhone(email, phoneNew);
        }
        return res.status(201).send(newAppointment.data);
      } else {
        return res
          .status(400)
          .send("Turnos completos en el horario solicitado");
      }
    }
  } catch {
    return res
      .status(500)
      .send("No es posible reservar un turno en este momento");
  }
};

const getAllBranchs = async (req, res) => {
  try {
    const names = [];
    const branchesNames = await BranchsService.getAllBranchs();
    if (branchesNames.error) {
      return res.status(400).send({ message: branchesNames.data.message });
    }
    branchesNames.data.map((branch) => {
      return names.push(branch.name);
    });
    return res.status(200).send(names);
  } catch {
    return res
      .status(500)
      .send(`Error del servidor, vuelva a intentarlo mas tarde..`);
  }
};

const getDaysAvailable = async (req, res) => {
  try {
    const { days, branch, email } = req.body;
    const userAppointments = await AppointmentsService.getAllUserAppointments(
      email
    );
    if (userAppointments.error) {
      return res.status(400).send({ message: userAppointments.data.message });
    }
    const turnos = userAppointments.data.map((turno) => {
      return turno.date;
    });
    const selectedBranch = await BranchsService.getSingleBranch(branch);
    if (selectedBranch.error) {
      return res.status(400).send({ message: selectedBranch.data.message });
    }
    const { openingHour, closingHour, allowedClients } = selectedBranch.data[0];
    const timeNow = DateTime.local();
    const openingTime = DateTime.fromFormat(openingHour, "HH:mm");
    const closingTime = DateTime.fromFormat(closingHour, "HH:mm");
    const hoursOpen = closingTime.diff(openingTime, "hours").hours;
    const twoHoursWindow = closingTime.diff(timeNow, "hours").hours;
    const formattedDayNow = timeNow.toFormat("dd-MM-yyyy");
    const appoinmentsPerDay = hoursOpen * 4 * allowedClients;
    const arrayToSend = [];
    const promises = days.map(async (day) => {
      const availableAppoinments =
        await AppointmentsService.getAvailableAppointments(day);
      if (day !== formattedDayNow || twoHoursWindow > 2) {
        if (availableAppoinments.data.length < appoinmentsPerDay) {
          return arrayToSend.push({
            day,
            availables: appoinmentsPerDay - availableAppoinments.length,
          });
        }
      }
    });
    await Promise.all(promises);
    return res.status(200).send({
      arrayToSend,
      turnos,
    });
  } catch {
    return res
      .status(500)
      .send(`Error del servidor, vuelva a intentarlo mas tarde..`);
  }
};

const getHoursAvailable = async (req, res) => {
  const { day, branch } = req.body;
  try {
    const fechaSeleccionada = day;
    const selectedBranch = await BranchsService.getSingleBranch(branch);
    const { openingHour, closingHour, allowedClients } = selectedBranch.data[0];
    const openingTime = moment(openingHour, "HH:mm");
    const closingTime = moment(closingHour, "HH:mm");
    const duration = moment.duration(closingTime.diff(openingTime));
    const numIntervals = Math.ceil(duration.asMinutes() / 15);
    const timeNow = DateTime.local();
    const horarios = {};
    for (let i = 0; i < numIntervals; i++) {
      const start = openingTime.clone().add(i * 15, "minutes");
      const horario = start.format("HH:mm");
      horarios[horario] = { horario: horario, count: 0 };
    }
    const appointments =
      await AppointmentsService.appointmentCounterSelectedDayInBranch(
        fechaSeleccionada,
        branch
      );
    appointments.data.forEach((appointment) => {
      const horario = appointment._id;
      const count = appointment.count;
      if (horarios.hasOwnProperty(horario)) {
        horarios[horario].count = count;
      }
    });
    const resultados = Object.values(horarios);
    const horariosFiltrados = [];
    resultados.map((resultado) => {
      if (resultado.count < allowedClients) {
        horariosFiltrados.push(resultado.horario);
      }
    });
    const horariosDisponibles = [];
    horariosFiltrados.forEach((horario) => {
      const horarioFormat = DateTime.fromFormat(horario, "HH:mm");
      if (
        fechaSeleccionada === timeNow.toFormat("dd-MM-yyyy") &&
        horarioFormat.diff(timeNow, "hours").hours > 2
      ) {
        return horariosDisponibles.push(horario);
      }
      if (fechaSeleccionada !== timeNow.toFormat("dd-MM-yyyy")) {
        return horariosDisponibles.push(horario);
      }
    });
    return res.status(200).send(horariosDisponibles);
  } catch (error) {
    return res
      .status(500)
      .send(`Error del servidor, vuelva a intentarlo mas tarde..`);
  }
};

const editAppointment = async (req, res) => {
  try {
    const { idApp, day, time, branch, phoneNew, email } = req.body;
    const user = await UsersService.searchUserByEmail(email);
    const selectedBranch = await BranchsService.getSingleBranch(branch);
    const { id, name, openingHour, closingHour, allowedClients } =
      selectedBranch.data[0];
    const sucursal = {
      id,
      name,
      location: name,
      openingHour,
      closingHour,
      allowedClients,
    };
    const appointmentUpdate =
      await AppointmentsService.findOneAndEditAppointment(
        idApp,
        day,
        time,
        sucursal
      );

    if (user?.data?.phone) {
      if (user.data.phone !== phoneNew) {
        await UsersService.updateUserPhone(email, phoneNew);
      }
    }
    return res.status(200).send(appointmentUpdate.data);
  } catch (error) {
    return res
      .status(500)
      .send(`Error del servidor, vuelva a intentarlo mas tarde..`);
  }
};

const cancelAppointment = async (req, res) => {
  const { token } = req.query;
  const { idApp } = req.params;
  const { cancelReason } = req.body;
  const decodedUser = validateToken(token);
  try {
    if (decodedUser) {
      const canceledAppointment =
        await AppointmentsService.findOneAndCancelAppointment(
          idApp,
          cancelReason
        );
      return res.status(200).send(canceledAppointment.data);
    } else {
      return res.status(400).send("Usuario no encontrado");
    }
  } catch (error) {
    return res
      .status(500)
      .send(`Error del servidor, vuelva a intentarlo mas tarde..`);
  }
};

const getUserLastAppointment = async (req, res) => {
  try {
    const { token } = req.query;
    const decodedUser = validateToken(token);
    if (decodedUser) {
      const userAppointment = await AppointmentsService.getUserLastAppointment(
        decodedUser._id
      );
      const testEmailUser = await appointmentConfirmation(userAppointment.data);
      if (testEmailUser) {
        return res.status(401).send(`Mail invalido`);
      }
      return res.status(200).send(userAppointment.data);
    } else {
      return res.status(400).send(`Credenciales invalidas`);
    }
  } catch {
    return res
      .status(500)
      .send(`Error del servidor, vuelva a intentarlo mas tarde..`);
  }
};

const getUserAppointmentById = async (req, res) => {
  try {
    const { token } = req.query;
    const { idApp } = req.params;
    const decodedUser = validateToken(token);
    if (decodedUser) {
      const userAppointment = await AppointmentsService.getUserAppointmentById(
        idApp
      );
      return res.status(200).send(userAppointment.data);
    } else {
      return res.status(400).send(`Credenciales invalidas`);
    }
  } catch (error) {
    return res
      .status(500)
      .send(`Error del servidor, vuelva a intentarlo mas tarde..`);
  }
};

module.exports = {
  createAppointment,
  getAllBranchs,
  getDaysAvailable,
  getHoursAvailable,
  editAppointment,
  cancelAppointment,
  getUserLastAppointment,
  getUserAppointmentById,
};

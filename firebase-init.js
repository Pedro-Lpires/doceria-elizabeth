const firebaseConfig = {
  apiKey: "AIzaSyAOnIjQtfpjtSB27fDlPzSGdAQFzzEkrhY",
  authDomain: "doceria-nick.firebaseapp.com",
  projectId: "doceria-nick",
  storageBucket: "doceria-nick.firebasestorage.app",
  messagingSenderId: "542505510785",
  appId: "1:542505510785:web:0bc83d1ebaa2d93a2baa80",
  measurementId: "G-WB07VDDS36"
};

if(!firebase.apps.length){
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

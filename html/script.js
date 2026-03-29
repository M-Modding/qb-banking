const { createApp, onMounted, ref } = Vue;

const bankingApp = createApp({
    data() {
        return {
            isBankOpen: false,
            isATMOpen: false,
            showPinPrompt: false,
            notification: null,
            activeView: "home",
            accounts: [],
            statements: {},
            selectedAccountStatement: "checking",
            playerName: "",
            accountNumber: "",
            playerCash: 0,
            selectedMoneyAccount: null,
            selectedMoneyAmount: 0,
            moneyReason: "",
            transferType: "internal",
            internalFromAccount: null,
            internalToAccount: null,
            internalTransferAmount: 0,
            externalAccountNumber: "",
            externalFromAccount: null,
            externalTransferAmount: 0,
            transferReason: "",
            debitPin: "",
            enteredPin: "",
            tempBankData: null,
            createAccountName: "",
            createAccountAmount: 0,
            editAccount: null,
            editAccountName: "",
            manageAccountName: null,
            manageUserName: "",
        };
    },

    methods: {
        openBank(bankData) {
            const playerData = bankData.playerData;
            this.playerName = `${playerData.charinfo.firstname} ${playerData.charinfo.lastname}`;
            this.accountNumber = playerData.citizenid;
            this.playerCash = playerData.money?.cash || 0;

            this.accounts = bankData.accounts.map(acc => ({
                name: acc.account_name,
                type: acc.account_type,
                balance: acc.account_balance,
                users: acc.users,
                id: acc.id
            }));

            this.statements = {};
            Object.keys(bankData.statements || {}).forEach(key => {
                this.statements[key] = bankData.statements[key].map(s => ({
                    id: s.id,
                    date: s.date,
                    reason: s.reason,
                    amount: parseFloat(s.amount),
                    type: s.statement_type,
                }));
            });

            this.isBankOpen = true;
            this.activeView = 'home';
        },

        openATM(bankData) {
            this.tempBankData = bankData;
            this.showPinPrompt = true;
        },

        pinPrompt(pin) {
            if (!pin || pin.length < 4) {
                this.addNotification("PIN-koodi on liian lyhyt", "error");
                return;
            }
            this.showPinPrompt = false;
            this.openBank(this.tempBankData);
            this.isATMOpen = true;
        },

        withdrawMoney() {
            if (!this.selectedMoneyAccount || this.selectedMoneyAmount <= 0) return;
            axios.post("https://qb-banking/withdraw", {
                accountName: this.selectedMoneyAccount.name,
                amount: this.selectedMoneyAmount,
                reason: this.moneyReason || "Nosto"
            }).then(res => {
                if (res.data.success) {
                    const acc = this.accounts.find(a => a.name === this.selectedMoneyAccount.name);
                    if (acc) acc.balance -= this.selectedMoneyAmount;
                    this.playerCash += this.selectedMoneyAmount;
                    this.addStatement(this.accountNumber, this.selectedMoneyAccount.name, this.moneyReason || "Nosto", this.selectedMoneyAmount, "withdraw");
                    this.addNotification("Nosto onnistui", "success");
                    this.selectedMoneyAmount = 0;
                    this.moneyReason = "";
                } else {
                    this.addNotification(res.data.message || "Virhe nostossa", "error");
                }
            });
        },

        depositMoney() {
            if (!this.selectedMoneyAccount || this.selectedMoneyAmount <= 0) return;
            axios.post("https://qb-banking/deposit", {
                accountName: this.selectedMoneyAccount.name,
                amount: this.selectedMoneyAmount,
                reason: this.moneyReason || "Talletus"
            }).then(res => {
                if (res.data.success) {
                    const acc = this.accounts.find(a => a.name === this.selectedMoneyAccount.name);
                    if (acc) acc.balance += this.selectedMoneyAmount;
                    this.playerCash -= this.selectedMoneyAmount;
                    this.addStatement(this.accountNumber, this.selectedMoneyAccount.name, this.moneyReason || "Talletus", this.selectedMoneyAmount, "deposit");
                    this.addNotification("Talletus onnistui", "success");
                    this.selectedMoneyAmount = 0;
                    this.moneyReason = "";
                } else {
                    this.addNotification(res.data.message || "Virhe talletuksessa", "error");
                }
            });
        },

        internalTransfer() {
            if (!this.internalFromAccount || !this.internalToAccount || this.internalTransferAmount <= 0) return;
            axios.post("https://qb-banking/internalTransfer", {
                fromAccountName: this.internalFromAccount.name,
                toAccountName: this.internalToAccount.name,
                amount: this.internalTransferAmount,
                reason: this.transferReason || "Sisäinen siirto"
            }).then(res => {
                if (res.data.success) {
                    const from = this.accounts.find(a => a.name === this.internalFromAccount.name);
                    const to = this.accounts.find(a => a.name === this.internalToAccount.name);
                    if (from) from.balance -= this.internalTransferAmount;
                    if (to) to.balance += this.internalTransferAmount;
                    this.addStatement(this.accountNumber, this.internalFromAccount.name, this.transferReason, this.internalTransferAmount, "withdraw");
                    this.addStatement(this.accountNumber, this.internalToAccount.name, this.transferReason, this.internalTransferAmount, "deposit");
                    this.addNotification("Siirto onnistui", "success");
                    this.internalTransferAmount = 0;
                    this.transferReason = "";
                } else {
                    this.addNotification(res.data.message, "error");
                }
            });
        },

        externalTransfer() {
            if (!this.externalFromAccount || !this.externalAccountNumber || this.externalTransferAmount <= 0) return;
            axios.post("https://qb-banking/externalTransfer", {
                fromAccountName: this.externalFromAccount.name,
                toAccountNumber: this.externalAccountNumber,
                amount: this.externalTransferAmount,
                reason: this.transferReason || "Ulkoinen siirto"
            }).then(res => {
                if (res.data.success) {
                    const from = this.accounts.find(a => a.name === this.externalFromAccount.name);
                    if (from) from.balance -= this.externalTransferAmount;
                    this.addStatement(this.accountNumber, this.externalFromAccount.name, this.transferReason, this.externalTransferAmount, "withdraw");
                    this.addNotification("Siirto onnistui", "success");
                    this.externalTransferAmount = 0;
                    this.transferReason = "";
                    this.externalAccountNumber = "";
                } else {
                    this.addNotification(res.data.message, "error");
                }
            });
        },

        orderDebitCard() {
            if (!this.debitPin) return;
            axios.post("https://qb-banking/orderCard", { pin: this.debitPin })
                .then(res => this.addNotification(res.data.message, res.data.success ? "success" : "error"));
        },

        openAccount() {
            if (!this.createAccountName) return;
            axios.post("https://qb-banking/openAccount", {
                accountName: this.createAccountName,
                amount: this.createAccountAmount || 0
            }).then(res => this.addNotification(res.data.message, res.data.success ? "success" : "error"));
        },

        renameAccount() {
            if (!this.editAccount || !this.editAccountName) return;
            axios.post("https://qb-banking/renameAccount", {
                oldName: this.editAccount.name,
                newName: this.editAccountName
            }).then(res => this.addNotification(res.data.message, res.data.success ? "success" : "error"));
        },

        deleteAccount() {
            if (!this.editAccount) return;
            axios.post("https://qb-banking/deleteAccount", { accountName: this.editAccount.name })
                .then(res => this.addNotification(res.data.message, res.data.success ? "success" : "error"));
        },

        addUserToAccount() {
            if (!this.manageAccountName || !this.manageUserName) return;
            axios.post("https://qb-banking/addUser", {
                accountName: this.manageAccountName.name,
                userName: this.manageUserName
            }).then(res => this.addNotification(res.data.message, res.data.success ? "success" : "error"));
        },

        removeUserFromAccount() {
            if (!this.manageAccountName || !this.manageUserName) return;
            axios.post("https://qb-banking/removeUser", {
                accountName: this.manageAccountName.name,
                userName: this.manageUserName
            }).then(res => this.addNotification(res.data.message, res.data.success ? "success" : "error"));
        },

        addStatement(accountNumber, accountName, reason, amount, type) {
            if (!this.statements[accountName]) this.statements[accountName] = [];
            this.statements[accountName].unshift({
                id: Date.now(),
                date: Date.now(),
                reason: reason,
                amount: amount,
                type: type
            });
        },

        addNotification(message, type) {
            this.notification = { message, type };
            setTimeout(() => this.notification = null, 4500);
        },

        appendNumber(num) {
            if (this.enteredPin.length < 4) this.enteredPin += num.toString();
        },

        selectAccount(account) {
            this.selectedAccountStatement = account.name;
        },

        setTransferType(type) {
            this.transferType = type;
        },

        setActiveView(view) {
            this.activeView = view;
        },

        formatCurrency(amount) {
            return new Intl.NumberFormat('fi-FI').format(Math.round(amount));
        },

        formatDate(timestamp) {
            const date = new Date(parseInt(timestamp));
            return date.toLocaleDateString('fi-FI', { day: '2-digit', month: '2-digit', year: 'numeric' });
        },

        closeApplication() {
            this.isBankOpen = false;
            this.isATMOpen = false;
            this.showPinPrompt = false;
            this.enteredPin = "";
            axios.post(`https://${GetParentResourceName()}/closeApp`, {});
        },

        handleMessage(event) {
            const data = event.data;
            if (data.action === "openBank") this.openBank(data);
            else if (data.action === "openATM") this.openATM(data);
        },

        handleKeydown(e) {
            if (e.key === "Escape") this.closeApplication();
        }
    },

    mounted() {
        window.addEventListener("message", this.handleMessage);
        document.addEventListener("keydown", this.handleKeydown);
    },

    beforeUnmount() {
        window.removeEventListener("message", this.handleMessage);
        document.removeEventListener("keydown", this.handleKeydown);
    },

    setup() {
        const chartCanvas = ref(null);

        onMounted(() => {
            if (!chartCanvas.value) return;
            const ctx = chartCanvas.value.getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, 0, 320);
            gradient.addColorStop(0, 'rgba(0, 51, 160, 0.28)');
            gradient.addColorStop(1, 'rgba(0, 163, 224, 0.06)');

            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'],
                    datasets: [{
                        label: 'Saldo (€)',
                        data: [1240, 1380, 1320, 1490, 1580, 1520, 1610],
                        fill: true,
                        backgroundColor: gradient,
                        borderColor: '#005EB8',
                        borderWidth: 3.5,
                        tension: 0.4,
                        pointRadius: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { grid: { color: '#f0f0f0' }, ticks: { color: '#666' } },
                        x: { grid: { display: false }, ticks: { color: '#666' } }
                    }
                }
            });
        });

        return { chartCanvas };
    }
}).mount("#app");
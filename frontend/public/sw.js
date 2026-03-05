self.addEventListener('push', function (event) {
    let data = {};
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data = { title: "까먹지 마! 🐰", body: event.data.text() };
        }
    }

    const title = data.title || '🐰 앗! 잊지 마세요!';
    const options = {
        body: data.body || '새로운 할 일 알림이 도착했습니다.',
        icon: '/vite.svg',
        badge: '/vite.svg',
        vibrate: [200, 100, 200, 100, 200, 100, 200],
        requireInteraction: true,
        data: {
            dateOfArrival: Date.now(),
            primaryKey: '1'
        }
    };

    // OS 네이티브 알람 띄우기
    let promiseChain = self.registration.showNotification(title, options);

    // 열려있는 브라우저 화면(React)으로 메시지(토스트용) 전송
    const messageChain = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
        for (let client of windowClients) {
            client.postMessage({
                type: 'PUSH_TOAST',
                title: title,
                body: options.body
            });
        }
    });

    event.waitUntil(Promise.all([promiseChain, messageChain]));
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    // 푸시 알림 클릭 시 메인 페이지로 이동 (또는 특정 탭 열기)
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            if (clientList.length > 0) {
                let client = clientList[0];
                for (let i = 0; i < clientList.length; i++) {
                    if (clientList[i].focused) {
                        client = clientList[i];
                    }
                }
                return client.focus();
            }
            return clients.openWindow('/');
        })
    );
});

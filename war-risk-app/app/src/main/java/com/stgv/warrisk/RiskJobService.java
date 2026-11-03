package com.stgv.warrisk;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** 주기적으로 깨어나 뉴스를 확인하고, 위험 단계가 올라가면 알림을 보낸다. */
public class RiskJobService extends JobService {
    private Thread worker;

    @Override
    public boolean onStartJob(final JobParameters params) {
        worker = new Thread(() -> {
            boolean ok = false;
            try {
                ok = Checker.runCheck(getApplicationContext(), true) != null;
            } catch (Exception ignored) {
            }
            jobFinished(params, !ok);
        }, "risk-check");
        worker.start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        if (worker != null) worker.interrupt();
        return true;
    }
}

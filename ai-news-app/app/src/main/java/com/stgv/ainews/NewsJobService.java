package com.stgv.ainews;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** 몇 시간마다 소식을 받아 와서 새 모델 출시 소식이 있으면 알린다. */
public class NewsJobService extends JobService {
    static final int JOB_ID = 4201;

    static void schedule(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (!Store.notifyEnabled(c)) {
            js.cancel(JOB_ID);
            return;
        }
        if (js.getPendingJob(JOB_ID) != null) return;
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(c, NewsJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(3 * 3600_000L, 3600_000L)
                .setPersisted(true)
                .build();
        js.schedule(job);
    }

    private Thread worker;

    @Override
    public boolean onStartJob(final JobParameters params) {
        worker = new Thread(() -> {
            try {
                List<String> errors = Collections.synchronizedList(new ArrayList<>());
                List<NewsItem> items = NewsFetcher.fetchAll(errors);
                if (!items.isEmpty()) {
                    Store.saveNews(this, items);
                    Notifier.notifyNew(this, items);
                }
            } catch (Throwable ignored) {
            }
            jobFinished(params, false);
        });
        worker.start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        if (worker != null) worker.interrupt();
        return true;
    }
}

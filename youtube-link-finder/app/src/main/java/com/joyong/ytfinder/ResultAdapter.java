package com.joyong.ytfinder;

import android.content.Context;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

final class ResultAdapter extends BaseAdapter {
    private final LayoutInflater inflater;
    private List<VideoItem> items = new ArrayList<>();

    ResultAdapter(Context context) {
        inflater = LayoutInflater.from(context);
    }

    void setItems(List<VideoItem> items) {
        this.items = items;
        notifyDataSetChanged();
    }

    List<VideoItem> getItems() {
        return items;
    }

    @Override
    public int getCount() {
        return items.size();
    }

    @Override
    public VideoItem getItem(int position) {
        return items.get(position);
    }

    @Override
    public long getItemId(int position) {
        return position;
    }

    @Override
    public View getView(int position, View convertView, ViewGroup parent) {
        View v = convertView != null ? convertView : inflater.inflate(R.layout.item_result, parent, false);
        VideoItem item = items.get(position);
        ((TextView) v.findViewById(R.id.title)).setText((position + 1) + ". " + item.title);
        TextView meta = v.findViewById(R.id.meta);
        String m = item.meta();
        meta.setText(m);
        meta.setVisibility(m.isEmpty() ? View.GONE : View.VISIBLE);
        ((TextView) v.findViewById(R.id.link)).setText(item.url());
        return v;
    }
}

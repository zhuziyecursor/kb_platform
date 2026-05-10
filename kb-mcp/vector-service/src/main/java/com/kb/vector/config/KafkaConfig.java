package com.kb.vector.config;

import com.kb.vector.dto.EmbedTaskMessage;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.errors.SerializationException;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.support.serializer.DeserializationException;
import org.springframework.kafka.support.serializer.ErrorHandlingDeserializer;
import org.springframework.kafka.support.serializer.JsonDeserializer;
import org.springframework.util.backoff.FixedBackOff;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Configuration
public class KafkaConfig {

    @Value("${spring.kafka.bootstrap-servers}")
    private String bootstrapServers;

    @Bean
    public ConsumerFactory<String, EmbedTaskMessage> consumerFactory() {
        Map<String, Object> props = new HashMap<>();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "vector-service");
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, 32);

        JsonDeserializer<EmbedTaskMessage> deserializer = new JsonDeserializer<>(EmbedTaskMessage.class);
        deserializer.addTrustedPackages("*");
        deserializer.setUseTypeHeaders(false);

        return new DefaultKafkaConsumerFactory<>(
                props,
                new ErrorHandlingDeserializer<>(new StringDeserializer()),
                new ErrorHandlingDeserializer<>(deserializer)
        );
    }

    @Bean
    public DefaultErrorHandler kafkaErrorHandler() {
        DefaultErrorHandler handler = new DefaultErrorHandler((record, exception) -> {
            log.error("Skipping invalid Kafka record: topic={}, partition={}, offset={}, key={}, error={}",
                    record.topic(), record.partition(), record.offset(), record.key(), exception.getMessage());
        }, new FixedBackOff(0L, 0L));
        handler.setCommitRecovered(true);
        handler.addNotRetryableExceptions(
                SerializationException.class,
                DeserializationException.class,
                IllegalArgumentException.class
        );
        return handler;
    }

    @Bean("batchFactory")
    public ConcurrentKafkaListenerContainerFactory<String, EmbedTaskMessage> batchFactory(
            ConsumerFactory<String, EmbedTaskMessage> consumerFactory,
            DefaultErrorHandler kafkaErrorHandler) {
        ConcurrentKafkaListenerContainerFactory<String, EmbedTaskMessage> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory);
        factory.setBatchListener(true);
        factory.setCommonErrorHandler(kafkaErrorHandler);
        factory.setRecordFilterStrategy(record -> {
            if (record.value() != null) {
                return false;
            }
            log.error("Skipping null embed-task message after deserialization failure: topic={}, partition={}, offset={}, key={}",
                    record.topic(), record.partition(), record.offset(), record.key());
            return true;
        });
        factory.setAckDiscarded(true);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        return factory;
    }
}
